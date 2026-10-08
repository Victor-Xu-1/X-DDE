import { expect, it } from "vitest";
import { nativeTraces, type ChartTrace, type MatrixTextTrace } from "./types";
it("passes the native heatmap text matrix without rewriting data or missing cells", () => {
  const data: ChartTrace[] = [
    {
      type: "heatmap",
      z: [
        [0, null],
        [3, 4],
      ],
      text: [
        ["zero", "missing"],
        ["three", "four"],
      ],
    },
  ];
  expect(nativeTraces(data)).toBe(data);
  expect((data[0] as MatrixTextTrace).z).toEqual([
    [0, null],
    [3, 4],
  ]);
  expect(() =>
    nativeTraces([{ type: "heatmap", z: [[1]], text: [["wrong", "shape"]] }]),
  ).toThrow(/match/);
});
