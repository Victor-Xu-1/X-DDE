import { expect, it } from "vitest";
import { generatedMetrics } from "./generated-metrics";

const row = {
  molecular_weight: 410.45,
  qed: 0.7,
  sa: 3.1,
  logp: 2.3,
  hbd: 1,
  hba: 5,
  tpsa: 87.12,
  rotatable_bonds: 5,
  minimum_pocket_distance_angstrom: 0.88,
  pocket_atom_pairs_under_1_2_angstrom: 4,
};

it("keeps full precision and original record order including native steric warning counts", () => {
  const report = {
    molecules: [
      row,
      {
        ...row,
        molecular_weight: 308.5,
        minimum_pocket_distance_angstrom: 1.639,
        pocket_atom_pairs_under_1_2_angstrom: 0,
      },
    ],
  };
  const metrics = generatedMetrics(report)!;
  expect(metrics[0]).toEqual({ ...row, fragments: null, heavy_atoms: null });
  expect(metrics[1].molecular_weight).toBe(308.5);
  expect(metrics[0].pocket_atom_pairs_under_1_2_angstrom).toBe(4);
  expect(report.molecules[0]).toEqual(row);
});

it("retains reported component counts without guessing connectivity for older or invalid metadata", () => {
  for (const fragments of [undefined, null, -1, 0, 1.5, "1"])
    expect(
      generatedMetrics({ molecules: [{ ...row, fragments }] })![0].fragments,
    ).toBeNull();
  expect(
    generatedMetrics({ molecules: [{ ...row, fragments: 3 }] })![0].fragments,
  ).toBe(3);
});

it("retains output heavy-atom counts separately from target size and never fabricates missing counts", () => {
  const report = { target_atoms: 32, molecules: [{ ...row, heavy_atoms: 16 }] };
  expect(generatedMetrics(report)![0].heavy_atoms).toBe(16);
  expect(report.molecules[0].heavy_atoms).toBe(16);
  for (const heavy_atoms of [undefined, null, 0, -1, 16.5, "32", Infinity])
    expect(
      generatedMetrics({ molecules: [{ ...row, heavy_atoms }] })![0]
        .heavy_atoms,
    ).toBeNull();
});

it("does not substitute zero or confidence for missing/invalid geometry or descriptors", () => {
  for (const value of [
    undefined,
    { molecules: [null] },
    { molecules: [{ ...row, qed: NaN }] },
    { molecules: [{ ...row, minimum_pocket_distance_angstrom: undefined }] },
    { molecules: [{ ...row, pocket_atom_pairs_under_1_2_angstrom: -1 }] },
  ]) {
    expect(generatedMetrics(value)).toBeNull();
  }
});
