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
  const placed: LabelBox[] = [];
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
      !placed.some((previous) => overlaps(candidate, previous, gap)) &&
      (!ligand || !overlaps(candidate, ligand, gap));
    const box = occupied
      ? choosePrintPosition(
          candidates,
          anchor,
          viewport,
          gap,
          available,
          occupied,
        )
      : candidates.find(available);
    if (box) {
      placed.push(box);
      result[index] = box;
    }
  }
  return result;
}

function choosePrintPosition(
  candidates: LabelBox[],
  anchor: LabelAnchor,
  viewport: ViewportSize,
  gap: number,
  available: (candidate: LabelBox) => boolean,
  occupied: GeometryOccupancy,
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
  let nearest = Infinity;
  for (const candidate of candidates) {
    if (!available(candidate)) continue;
    const ink = occupied({
      x: candidate.x - gap,
      y: candidate.y - gap,
      width: candidate.width + gap * 2,
      height: candidate.height + gap * 2,
    });
    const distance = Math.hypot(
      Math.max(0, candidate.x - anchor.x, anchor.x - candidate.x - candidate.width),
      Math.max(0, candidate.y - anchor.y, anchor.y - candidate.y - candidate.height),
    );
    if (ink < leastInk || (ink === leastInk && distance < nearest)) {
      best = candidate;
      leastInk = ink;
      nearest = distance;
    }
  }
  return best;
}
