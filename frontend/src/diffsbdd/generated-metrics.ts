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
      }) as unknown as GeneratedMetrics,
  );
}
