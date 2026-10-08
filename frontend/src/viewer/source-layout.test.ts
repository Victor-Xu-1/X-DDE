import { expect, it } from "vitest";
import { complexLigandModel, viewerLoad } from "./source-layout";
it("separates protein-interface presentation from incidental ligand proximity without changing source identity", () => {
  const input = {
    urls: ["/api/assets/antibody-complex"],
    comparison: false,
    ligandContext: false,
    initialMode: "cartoon",
  };
  expect(viewerLoad(input)).toEqual(input);
  expect(() => viewerLoad({ ...input, initialMode: "pocket" })).toThrow(
    "Pocket display requires a ligand context",
  );
  expect(() => viewerLoad({ ...input, ligandContext: "false" })).toThrow(
    "Invalid ligand display context",
  );
});
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
    { ...input, initialPosePrepared: "true" },
  ])
    expect(() => viewerLoad(value)).toThrow();
});

it("preserves an explicit computed-pose qualification without changing source records", () => {
  const value = {
    urls: ["/api/assets/prepared-pose"],
    records: [3],
    comparison: false,
    initialPosePrepared: true,
  };
  expect(viewerLoad(value)).toEqual(value);
});

it("keeps explicit whole-assembly presentation separate from the existing automatic pocket view", () => {
  const input = { urls: ["/api/assets/assembly"], comparison: false };
  expect(viewerLoad(input).initialMode).toBeUndefined();
  expect(viewerLoad({ ...input, initialMode: "cartoon" }).initialMode).toBe(
    "cartoon",
  );
  for (const mode of ["unknown", true, 1, {}, []])
    expect(() => viewerLoad({ ...input, initialMode: mode })).toThrow(
      "Invalid initial structure view",
    );
});
