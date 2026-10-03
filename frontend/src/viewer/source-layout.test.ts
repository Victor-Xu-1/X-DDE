import { expect, it } from "vitest";
import { complexLigandModel, viewerLoad } from "./source-layout";
it("treats an explicit receptor plus source pose as a complex, but does not connect comparisons or unrelated molecules", () => {
  const input = {
    urls: ["receptor", "pose"],
    comparison: false,
    focusModel: 1,
  };
  expect(complexLigandModel(["pdb", "sdf"], input)).toBe(1);
  expect(complexLigandModel(["cif", "mol2"], input)).toBe(1);
  expect(
    complexLigandModel(["pdb", "sdf"], { ...input, comparison: true }),
  ).toBeNull();
  expect(complexLigandModel(["sdf", "sdf"], input)).toBeNull();
  expect(complexLigandModel(["pdb", "pdb"], input)).toBeNull();
  expect(
    complexLigandModel(["pdb", "sdf"], { ...input, focusModel: 0 }),
  ).toBeNull();
});
it("accepts only bounded explicit viewer layouts and preserves source URLs", () => {
  const input = {
    urls: ["/api/assets/first", "/api/assets/second"],
    comparison: false,
    focusModel: 1,
  };
  expect(viewerLoad(input)).toEqual(input);
  for (const value of [
    null,
    [],
    { ...input, urls: [] },
    { ...input, urls: ["a", "b", "c", "d"] },
    { ...input, urls: [1] },
    { ...input, focusModel: 2 },
    { ...input, focusModel: 1.2 },
    { ...input, comparison: "false" },
  ])
    expect(() => viewerLoad(value)).toThrow();
});
