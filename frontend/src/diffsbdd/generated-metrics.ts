import type { CoreVerificationData } from "./types";

/** Native row order is the molecular record authority, not the current table order. */
export interface GeneratedMetrics {
  heavy_atoms?: number | null;
  molecular_weight: number;
  qed: number;
  sa: number;
  logp: number;
  hbd: number;
  hba: number;
  tpsa: number;
  rotatable_bonds: number;
  minimum_pocket_distance_angstrom: number;
  pocket_atom_pairs_under_1_2_angstrom: number;
  fragments: number | null;
  relaxation_converged?: boolean | null;
}

/** Fixed-region evidence is independent of the optional property report. */
export function qualifiedRecordMap(
  records: { record: number }[],
  verification: CoreVerificationData | undefined,
) {
  if (!verification || !records.length) return null;
  const ids = records.map(({ record }) => record);
  if (
    ids.some((id) => !Number.isSafeInteger(id) || id < 0) ||
    new Set(ids).size !== ids.length
  )
    return null;
  const qualified = verification.candidates.filter(
    (c) => c.qualified_record !== null,
  );
  if (
    qualified.length !== verification.qualified_count ||
    qualified.some((c) =>
      c.status !== "passed" || !Number.isSafeInteger(c.record) || c.record < 0 ||
      !Number.isSafeInteger(c.qualified_record) || c.qualified_record! < 0,
    ) ||
    new Set(qualified.map((c) => c.record)).size !== qualified.length ||
    new Set(qualified.map((c) => c.qualified_record)).size !== qualified.length
  ) return null;
  const original = ids.map((id) => {
    const match = qualified.find((c) => c.qualified_record === id);
    return match?.record ?? -1;
  });
  if (original.some((id) => id < 0)) return null;
  return new Map(ids.map((id, index) => [id, original[index]] as const));
}

/** Resolve displayed records only when the native property mapping is unambiguous. */
export function generatedRecordMap(
  records: { record: number }[],
  metrics: GeneratedMetrics[] | null | undefined,
  verification?: CoreVerificationData,
) {
  if (!metrics || !records.length) return null;
  const ids = records.map(({ record }) => record);
  if (ids.some((id) => !Number.isSafeInteger(id) || id < 0) ||
      new Set(ids).size !== ids.length) return null;
  let original: number[];
  if (verification) {
    const qualified = qualifiedRecordMap(records, verification);
    if (!qualified) return null;
    original = ids.map((id) => qualified.get(id)!);
  } else {
    // A filtered table can retain a strict subset of native records; original
    // record numbers still index the complete ordered native report.
    if (ids.length > metrics.length) return null;
    original = ids;
  }
  if (
    original.some(
      (id) => !Number.isSafeInteger(id) || id < 0 || id >= metrics.length,
    ) ||
    new Set(original).size !== original.length
  )
    return null;
  return new Map(ids.map((id, index) => [id, original[index]] as const));
}

/** Summarize only when every displayed record maps uniquely to its original report row. */
export function generatedBatchSummary(
  records: { record: number }[],
  metrics: GeneratedMetrics[] | null | undefined,
  verification?: CoreVerificationData,
) {
  const mapping = generatedRecordMap(records, metrics, verification);
  if (!mapping || !metrics) return null;
  // A subset is safe for individual lookup, but cannot represent the full batch.
  if (!verification && records.length !== metrics.length) return null;
  if (verification && records.length !== verification.qualified_count) return null;
  const rows = records.map(({ record }) => metrics[mapping.get(record)!]);
  return {
    total: rows.length,
    disconnected: rows.filter(
      (row) => row.fragments !== null && row.fragments > 1,
    ).length,
    connectivityReported: rows.filter((row) => row.fragments !== null).length,
    nearPocket: rows.filter(
      (row) => row.pocket_atom_pairs_under_1_2_angstrom > 0,
    ).length,
    relaxationUnconverged: rows.filter(
      (row) => row.relaxation_converged === false,
    ).length,
    relaxationReported: rows.filter(
      (row) => typeof row.relaxation_converged === "boolean",
    ).length,
  };
}

export function generatedMetrics(report: unknown): GeneratedMetrics[] | null {
  if (!report || typeof report !== "object") return null;
  const rows = (report as { molecules?: unknown }).molecules;
  if (!Array.isArray(rows) || rows.length > 100) return null;
  const fields: (keyof GeneratedMetrics)[] = [
    "molecular_weight",
    "qed",
    "sa",
    "logp",
    "hbd",
    "hba",
    "tpsa",
    "rotatable_bonds",
    "minimum_pocket_distance_angstrom",
    "pocket_atom_pairs_under_1_2_angstrom",
  ];
  if (
    rows.some(
      (row) =>
        !row ||
        fields.some(
          (key) => typeof row[key] !== "number" || !Number.isFinite(row[key]),
        ) ||
        row.molecular_weight <= 0 ||
        row.qed < 0 ||
        row.qed > 1 ||
        row.minimum_pocket_distance_angstrom < 0 ||
        [
          "hbd",
          "hba",
          "rotatable_bonds",
          "pocket_atom_pairs_under_1_2_angstrom",
        ].some((key) => !Number.isSafeInteger(row[key]) || row[key] < 0),
    )
  )
    return null;
  return rows.map(
    (row) =>
      ({
        ...Object.fromEntries(fields.map((key) => [key, row[key]])),
        heavy_atoms:
          Number.isSafeInteger(row.heavy_atoms) && row.heavy_atoms > 0
            ? row.heavy_atoms
            : null,
        fragments:
          Number.isSafeInteger(row.fragments) && row.fragments >= 1
            ? row.fragments
            : null,
        relaxation_converged:
          typeof row.relaxation_converged === "boolean"
            ? row.relaxation_converged
            : null,
      }) as unknown as GeneratedMetrics,
  );
}
