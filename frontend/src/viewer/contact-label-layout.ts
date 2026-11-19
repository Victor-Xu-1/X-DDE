import type { ViewportSize } from "./camera-resize";

export interface LabelBox {
  x: number;
  y: number;
  width: number;
  height: number;
}
export interface LabelAnchor {
  x: number;
  y: number;
  width: number;
  height: number;
}
export interface LabelPlacement {
  anchor: LabelAnchor;
  box: LabelBox;
}
export type GeometryOccupancy = (box: LabelBox) => number;
const finite = (values: number[]) => values.every(Number.isFinite);
const overlaps = (a: LabelBox, b: LabelBox, gap: number) =>
  a.x < b.x + b.width + gap &&
  a.x + a.width + gap > b.x &&
  a.y < b.y + b.height + gap &&
  a.y + a.height + gap > b.y;

/** Place annotation rectangles in screen space; no molecular coordinates are changed. */
export function contactLabelLayout(
  anchors: LabelAnchor[],
  viewport: ViewportSize,
  ligand: LabelBox | null,
  occupied?: GeometryOccupancy,
): (LabelBox | null)[] {
  const placed: LabelPlacement[] = [];
  const result: (LabelBox | null)[] = anchors.map(() => null);
  if (
    !finite([viewport.width, viewport.height]) ||
    viewport.width <= 0 ||
    viewport.height <= 0
  )
    return result;
  const gap = occupied ? Math.max(2, viewport.width * 0.005) : 6;
  const order = anchors
    .map((anchor, index) => ({ anchor, index }))
    .sort(
      (a, b) =>
        a.anchor.y - b.anchor.y || a.anchor.x - b.anchor.x || a.index - b.index,
    );
  for (const { anchor, index } of order) {
    if (
      !finite([anchor.x, anchor.y, anchor.width, anchor.height]) ||
      anchor.width <= 0 ||
      anchor.height <= 0
    )
      continue;
    if (
      occupied &&
      (anchor.x < 0 || anchor.y < 0 ||
        anchor.x > viewport.width || anchor.y > viewport.height)
    )
      continue;
    const candidates: LabelBox[] = [];
    for (const distance of [8, 28, 52, 80, 112])
      for (const dy of [
        -anchor.height - distance,
        distance,
        -anchor.height / 2,
      ])
        for (const dx of [
          distance,
          -anchor.width - distance,
          -anchor.width / 2,
        ])
          candidates.push({
            x: anchor.x + dx,
            y: anchor.y + dy,
            width: anchor.width,
            height: anchor.height,
          });
    const available = (candidate: LabelBox) =>
      candidate.x >= gap &&
      candidate.y >= gap &&
      candidate.x + candidate.width <= viewport.width - gap &&
      candidate.y + candidate.height <= viewport.height - gap &&
      !placed.some((previous) => overlaps(candidate, previous.box, gap)) &&
      (!occupied ||
        !anchors.some(({ x, y }) =>
          overlaps(candidate, { x, y, width: 0, height: 0 }, gap),
        )) &&
      (!ligand || !overlaps(candidate, ligand, gap));
    const box = occupied
      ? choosePrintPosition(
          candidates,
          anchor,
          viewport,
          gap,
          available,
          occupied,
          placed,
        )
      : candidates.find(available);
    if (box) {
      placed.push({ anchor, box });
      result[index] = box;
    }
  }
  return result;
}

export function labelLeaderEndpoint(
  anchor: Pick<LabelAnchor, "x" | "y">,
  box: LabelBox,
) {
  return {
    x: Math.max(box.x, Math.min(box.x + box.width, anchor.x)),
    y: Math.max(box.y, Math.min(box.y + box.height, anchor.y)),
  };
}

function leaderCrossesLabel(placement: LabelPlacement, obstacle: LabelBox) {
  const { anchor, box } = placement;
  const end = labelLeaderEndpoint(anchor, box);
  let first = 0;
  let last = 1;
  for (const [start, finish, low, high] of [
    [anchor.x, end.x, obstacle.x, obstacle.x + obstacle.width],
    [anchor.y, end.y, obstacle.y, obstacle.y + obstacle.height],
  ]) {
    const travel = finish - start;
    if (!travel) {
      if (start < low || start > high) return false;
      continue;
    }
    const a = (low - start) / travel;
    const b = (high - start) / travel;
    first = Math.max(first, Math.min(a, b));
    last = Math.min(last, Math.max(a, b));
    if (first > last) return false;
  }
  return true;
}

function choosePrintPosition(
  candidates: LabelBox[],
  anchor: LabelAnchor,
  viewport: ViewportSize,
  gap: number,
  available: (candidate: LabelBox) => boolean,
  occupied: GeometryOccupancy,
  placed: readonly LabelPlacement[],
) {
  // Search the page margins too. Keep the nearest readable placement and
  // prefer low-ink regions when an unusually dense image leaves no clear box.
  const columns = 16;
  const rows = 12;
  const usableWidth = viewport.width - anchor.width - gap * 2;
  const usableHeight = viewport.height - anchor.height - gap * 2;
  for (let row = 0; row <= rows; row++)
    for (let column = 0; column <= columns; column++)
      candidates.push({
        x: gap + (column / columns) * usableWidth,
        y: gap + (row / rows) * usableHeight,
        width: anchor.width,
        height: anchor.height,
      });
  let best: LabelBox | undefined;
  let leastInk = Infinity;
  let fewestCrossings = Infinity;
  let nearest = Infinity;
  for (const candidate of candidates) {
    if (!available(candidate)) continue;
    const ink = occupied({
      x: candidate.x - gap,
      y: candidate.y - gap,
      width: candidate.width + gap * 2,
      height: candidate.height + gap * 2,
    });
    if (ink > leastInk) continue;
    const placement = { anchor, box: candidate };
    const crossings = placed.reduce(
      (count, previous) =>
        count + Number(leaderCrossesLabel(placement, previous.box)) +
        Number(leaderCrossesLabel(previous, candidate)),
      0,
    );
    const end = labelLeaderEndpoint(anchor, candidate);
    const distance = Math.hypot(anchor.x - end.x, anchor.y - end.y);
    if (
      ink < leastInk ||
      crossings < fewestCrossings ||
      (crossings === fewestCrossings && distance < nearest)
    ) {
      best = candidate;
      leastInk = ink;
      fewestCrossings = crossings;
      nearest = distance;
    }
  }
  return best;
}
