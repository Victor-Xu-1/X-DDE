import { expect, it } from "vitest";
import { generatedMetrics, generatedBatchSummary } from "./generated-metrics";
import type { CoreVerificationData } from "./types";

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
  expect(metrics[0]).toEqual({
    ...row,
    fragments: null,
    heavy_atoms: null,
    relaxation_converged: null,
  });
  expect(metrics[1].molecular_weight).toBe(308.5);
  expect(metrics[0].pocket_atom_pairs_under_1_2_angstrom).toBe(4);
  expect(report.molecules[0]).toEqual(row);
});

it("retains true and false convergence separately from absent or malformed historical metadata", () => {
  for (const value of [undefined, null, "true", "false", 0, 1]) {
    expect(
      generatedMetrics({
        molecules: [{ ...row, relaxation_converged: value }],
      })![0].relaxation_converged,
    ).toBeNull();
  }
  for (const value of [true, false]) {
    const source = { ...row, relaxation_converged: value };
    expect(
      generatedMetrics({ molecules: [source] })![0].relaxation_converged,
    ).toBe(value);
    expect(source.relaxation_converged).toBe(value);
  }
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

it("summarizes reported batch indicators without treating missing values as passing", () => {
  const values = generatedMetrics({
    molecules: Array.from({ length: 16 }, (_, index) => ({
      ...row,
      fragments: index < 5 ? 1 : 2,
      relaxation_converged: index < 4 ? false : true,
    })),
  })!;
  expect(
    generatedBatchSummary(
      values.map((_, record) => ({ record })),
      values,
    ),
  ).toEqual({
    total: 16,
    disconnected: 11,
    connectivityReported: 16,
    nearPocket: 16,
    relaxationUnconverged: 4,
    relaxationReported: 16,
  });
  const incomplete = generatedMetrics({
    molecules: [
      { ...row },
      {
        ...row,
        fragments: 2,
        relaxation_converged: false,
        pocket_atom_pairs_under_1_2_angstrom: 0,
      },
    ],
  })!;
  expect(
    generatedBatchSummary([{ record: 0 }, { record: 1 }], incomplete),
  ).toEqual({
    total: 2,
    disconnected: 1,
    connectivityReported: 1,
    nearPocket: 1,
    relaxationUnconverged: 1,
    relaxationReported: 1,
  });
});

it("matches filtered records to original metrics and rejects ambiguous identity mappings", () => {
  const values = generatedMetrics({
    molecules: [
      { ...row, fragments: 1, relaxation_converged: true },
      { ...row, fragments: 2, relaxation_converged: false },
      { ...row, fragments: 1, pocket_atom_pairs_under_1_2_angstrom: 0 },
    ],
  })!;
  const verification: CoreVerificationData = {
    method: "rdkit_fixed_core_v1",
    preserve_bonds: true,
    qualified_count: 2,
    qualified_sha256: "abc",
    candidates: [
      {
        record: 0,
        qualified_record: 1,
        status: "passed",
        diagnostic_artifact: null,
        reason: null,
        maximum_displacement: null,
        mapping: [],
      },
      {
        record: 1,
        qualified_record: null,
        status: "failed",
        diagnostic_artifact: null,
        reason: null,
        maximum_displacement: null,
        mapping: [],
      },
      {
        record: 2,
        qualified_record: 0,
        status: "passed",
        diagnostic_artifact: null,
        reason: null,
        maximum_displacement: null,
        mapping: [],
      },
    ],
  };
  const records = [{ record: 0 }, { record: 1 }];
  expect(generatedBatchSummary(records, values, verification)).toEqual({
    total: 2,
    disconnected: 0,
    connectivityReported: 2,
    nearPocket: 1,
    relaxationUnconverged: 0,
    relaxationReported: 1,
  });
  expect(generatedBatchSummary(records, values)).toBeNull();
  expect(
    generatedBatchSummary([{ record: 0 }, { record: 0 }], values, verification),
  ).toBeNull();
  expect(
    generatedBatchSummary(records, values, {
      ...verification,
      candidates: [...verification.candidates, verification.candidates[0]],
    }),
  ).toBeNull();
  expect(
    generatedBatchSummary(records, values, {
      ...verification,
      candidates: verification.candidates.map((c) =>
        c.qualified_record === 1 ? { ...c, status: "failed" as const } : c,
      ),
    }),
  ).toBeNull();
});
