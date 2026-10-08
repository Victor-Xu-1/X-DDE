import type { SeriesRow } from "./chart-documents";

export function cyclePairs(rows: SeriesRow[]) {
  return [
    ...new Set(
      rows
        .filter((row) => row.kind === "di")
        .map((row) =>
          row.cycle_a !== undefined && row.cycle_b !== undefined
            ? `${row.cycle_a}:${row.cycle_b}`
            : "reported",
        ),
    ),
  ];
}
/** Preserve cycle identities and absent cells; omitted excerpt cells are not inferred to be unobserved. */
export function seriesMap(
  rows: SeriesRow[],
  pair: string,
  logarithmic: boolean,
) {
  const selected = rows.filter(
    (row) =>
      row.kind === "di" &&
      (row.cycle_a !== undefined && row.cycle_b !== undefined
        ? `${row.cycle_a}:${row.cycle_b}`
        : "reported") === pair,
  );
  const a = [...new Set(selected.map((row) => row.block_a))],
    b = [...new Set(selected.map((row) => row.block_b))];
  const lookup = new Map<string, SeriesRow>();
  for (const row of selected) {
    const key = JSON.stringify([row.block_a, row.block_b]);
    if (lookup.has(key))
      throw new Error("Ambiguous duplicate DEL combination.");
    lookup.set(key, row);
  }
  const cells = a.map((blockA) =>
    b.map((blockB) => lookup.get(JSON.stringify([blockA, blockB])) ?? null),
  );
  return {
    a,
    b,
    cells,
    z: cells.map((row) =>
      row.map((cell) =>
        cell ? (logarithmic ? Math.log2(1 + cell.score) : cell.score) : null,
      ),
    ),
  };
}
