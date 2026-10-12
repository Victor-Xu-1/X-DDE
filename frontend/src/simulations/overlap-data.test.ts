import { expect, it } from "vitest";
import { adjacentOverlap, overlapCsv } from "./overlap-data";

it("preserves asymmetric native overlap and exports full numeric precision", () => {
  const matrix = [
    [0.7, 0.123456789, 0.1],
    [0.08, 0.8, 0.12],
    [0.01, 0.02, 0.97],
  ];
  const original = structuredClone(matrix);
  const rows = adjacentOverlap(matrix)!;
  expect(rows).toEqual([
    { from: 0, to: 1, forward: 0.123456789, reverse: 0.08 },
    { from: 1, to: 2, forward: 0.12, reverse: 0.02 },
  ]);
  expect(overlapCsv(rows)).toContain("0,1,0.123456789,0.08");
  expect(matrix).toEqual(original);
});
it.each([
  undefined,
  [],
  [[1]],
  [[1, 0], [0]],
  [
    [1, NaN],
    [0, 1],
  ],
  [
    [1, -0.1],
    [0, 1],
  ],
  [
    [1.1, 0],
    [0, 1],
  ],
])(
  "does not present missing or invalid matrices as observed overlap: %j",
  (matrix) => expect(adjacentOverlap(matrix)).toBeNull(),
);
it("retains a valid zero-overlap result without inventing a minimum", () => {
  expect(
    adjacentOverlap([
      [1, 0],
      [0, 1],
    ]),
  ).toEqual([{ from: 0, to: 1, forward: 0, reverse: 0 }]);
});
