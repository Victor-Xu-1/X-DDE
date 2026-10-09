import { expect, it } from "vitest";
import { metricPoints, identityRange, plotText } from "./metric-scatter-model";

it("retains zero, signs, original ordering and exact row references after removing incomplete pairs", () => {
  const rows = [
    { x: 0, y: -1.2 },
    { x: 2, y: null },
    { x: 4, y: 0 },
  ];
  const points = metricPoints(
    rows,
    { key: "x", label: "x", value: (row) => row.x },
    { key: "y", label: "y", value: (row) => row.y },
  );
  expect(points.map((point) => [point.sourceIndex, point.x, point.y])).toEqual([
    [0, 0, -1.2],
    [2, 4, 0],
  ]);
  expect(points[1].row).toBe(rows[2]);
  expect(identityRange(points)![0]).toBeLessThan(-1.2);
  expect(identityRange(points)![1]).toBeGreaterThan(4);
  expect(identityRange([])).toBeNull();
});
it("retains source-owned names literally at native hover boundaries", () => {
  expect(plotText("Ligand <A> & B")).toBe("Ligand &lt;A&gt; &amp; B");
});
