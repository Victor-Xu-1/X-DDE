import { expect, it, vi } from "vitest";
import type * as mol from "3dmol";
import { attachmentGeometry, paintAttachments } from "./attachment-geometry";
const input = {
  points: [
    {
      origin: [0, 0, 0],
      target: [1, 1, 0],
      fromAtom: 0,
      toAtom: 1,
      region: "a",
      label: "C32 → C33",
    },
  ],
};
const renderer = () => ({
  selectedAtoms: vi.fn(() => [
    { x: 0, y: 0, z: 0, index: 20 },
    { x: 1, y: 1, z: 0, index: 21 },
  ]),
  addArrow: vi.fn(),
  addLabel: vi.fn(),
});
it("draws only the observed bond direction and preserves atoms and source coordinates", () => {
  const viewer = renderer(),
    before = JSON.stringify(input);
  paintAttachments(
    viewer as unknown as mol.GLViewer,
    attachmentGeometry(input),
  );
  expect(viewer.addArrow).toHaveBeenCalledWith(
    expect.objectContaining({ start: { x: 0, y: 0, z: 0 }, radius: 0.11 }),
  );
  const end = viewer.addArrow.mock.calls[0][0].end;
  expect(end.x).toBeCloseTo(3 / Math.sqrt(2), 12);
  expect(end.y).toBeCloseTo(3 / Math.sqrt(2), 12);
  expect(end.z).toBe(0);
  expect(JSON.stringify(input)).toBe(before);
});
it("rejects markers for another pose before adding any shape", () => {
  const viewer = renderer();
  const wrong = {
    points: [...input.points, { ...input.points[0], origin: [50, 50, 0] }],
  };
  expect(() =>
    paintAttachments(
      viewer as unknown as mol.GLViewer,
      attachmentGeometry(wrong),
    ),
  ).toThrow("displayed native ligand pose");
  expect(viewer.addArrow).not.toHaveBeenCalled();
});
it("respects hidden atom choices without deleting or moving source atoms", () => {
  const viewer = renderer();
  paintAttachments(
    viewer as unknown as mol.GLViewer,
    attachmentGeometry(input),
    new Set([21]),
  );
  expect(viewer.addArrow).not.toHaveBeenCalled();
  expect(viewer.selectedAtoms()).toHaveLength(2);
});
it("rejects invalid, degenerate and unbounded marker data", () => {
  for (const points of [
    [{ ...input.points[0], target: [0, 0, 0] }],
    [{ ...input.points[0], fromAtom: -1 }],
    [{ ...input.points[0], origin: [NaN, 0, 0] }],
    Array(17).fill(input.points[0]),
  ])
    expect(() => attachmentGeometry({ points })).toThrow(
      "Invalid observed attachment geometry",
    );
  expect(attachmentGeometry(undefined)).toBeUndefined();
});
