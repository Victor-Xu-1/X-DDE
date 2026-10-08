import { expect, it } from "vitest";
import { cyclePairs, seriesMap } from "./series-map";
import { validateChartDocument } from "./chart-documents";
it("keeps repeated building-block labels distinct across library cycles and preserves zeros", () => {
  const rows = [
    {
      kind: "di",
      cycle_a: 0,
      cycle_b: 1,
      block_a: "A",
      block_b: "B",
      score: 0,
      members: 2,
    },
    {
      kind: "di",
      cycle_a: 1,
      cycle_b: 2,
      block_a: "A",
      block_b: "B",
      score: 7,
      members: 5,
      lower: 3,
      upper: 12,
    },
    {
      kind: "di",
      cycle_a: 0,
      cycle_b: 1,
      block_a: "C",
      block_b: "D",
      score: 3,
      members: 1,
    },
  ];
  const before = JSON.stringify(rows);
  expect(cyclePairs(rows)).toEqual(["0:1", "1:2"]);
  expect(seriesMap(rows, "0:1", false).z).toEqual([
    [0, null],
    [null, 3],
  ]);
  expect(seriesMap(rows, "1:2", true).z).toEqual([[3]]);
  expect(seriesMap(rows, "1:2", true).cells[0][0]?.lower).toBe(3);
  expect(JSON.stringify(rows)).toBe(before);
});
it("does not cap source rows or axis labels and rejects ambiguous duplicate combinations", () => {
  const rows = Array.from({ length: 25 }, (_, i) => ({
    kind: "di",
    block_a: "A" + i,
    block_b: "B" + i,
    score: i,
    members: 1,
  }));
  expect(seriesMap(rows, "reported", true).a).toHaveLength(25);
  expect(() => seriesMap([rows[0], rows[0]], "reported", false)).toThrow(
    /Ambiguous/,
  );
});
it("checks native excerpt counts and posterior intervals while accepting retained legacy rows", () => {
  const row = { kind: "di", block_a: "A", block_b: "B", score: 3, members: 2 };
  expect(
    validateChartDocument("del_series_visualization", { series: [row] }),
  ).toEqual({ series: [row] });
  expect(() =>
    validateChartDocument("del_series_visualization", {
      series: [row],
      total_series: 0,
    }),
  ).toThrow();
  expect(() =>
    validateChartDocument("del_series_visualization", {
      series: [{ ...row, score: -2 }],
    }),
  ).toThrow();
  expect(() =>
    validateChartDocument("del_series_visualization", {
      series: [{ ...row, lower: 8, upper: 4 }],
    }),
  ).toThrow();
});
