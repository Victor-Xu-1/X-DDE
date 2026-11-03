import { expect, it } from "vitest";
import { confidencePlotLayout } from "./confidence-plot";
it("keeps native token positions, maps chain borders from observed chains, and highlights both axes", () => {
  const tokens = [
    { index: 0, chain: "Z", residue: "Z:ALA:10:", label: "Z:ALA10" },
    { index: 1, chain: "Q", residue: "Q:GLY:72:B", label: "Q:GLY72B" },
  ];
  const mapped = { key: "native", tokens, residueScores: {} };
  const layout = confidencePlotLayout(mapped, [tokens[1].residue], true);
  expect(layout.shapes).toHaveLength(4);
  expect(layout.shapes?.[0]).toMatchObject({ x0: 0.5, x1: 0.5, yref: "paper" });
  expect(layout.shapes?.[2]).toMatchObject({ x0: 0.5, x1: 1.5, yref: "paper" });
  expect(confidencePlotLayout(mapped, [], false).shapes).toEqual([]);
  expect(confidencePlotLayout(null, [], true)).toEqual({});
});
