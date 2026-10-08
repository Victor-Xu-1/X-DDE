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
const gap = 6;
const finite = (values: number[]) => values.every(Number.isFinite);
const overlaps = (a: LabelBox, b: LabelBox) =>
  a.x < b.x + b.width + gap &&
  a.x + a.width + gap > b.x &&
  a.y < b.y + b.height + gap &&
  a.y + a.height + gap > b.y;

/** Place annotation rectangles in screen space; no molecular coordinates are changed. */
export function contactLabelLayout(
  anchors: LabelAnchor[],
  viewport: ViewportSize,
  ligand: LabelBox | null,
): (LabelBox | null)[] {
  const placed: LabelBox[] = [];
  const result: (LabelBox | null)[] = anchors.map(() => null);
  if (
    !finite([viewport.width, viewport.height]) ||
    viewport.width <= 0 ||
    viewport.height <= 0
  )
    return result;
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
    const box = candidates.find(
      (candidate) =>
        candidate.x >= gap &&
        candidate.y >= gap &&
        candidate.x + candidate.width <= viewport.width - gap &&
        candidate.y + candidate.height <= viewport.height - gap &&
        !placed.some((previous) => overlaps(candidate, previous)) &&
        (!ligand || !overlaps(candidate, ligand)),
    );
    if (box) {
      placed.push(box);
      result[index] = box;
    }
  }
  return result;
}
