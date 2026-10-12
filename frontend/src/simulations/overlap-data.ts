export interface AdjacentOverlap {
  from: number;
  to: number;
  forward: number;
  reverse: number;
}

/** MBAR overlap is directional. Preserve each native entry without symmetrizing. */
export function adjacentOverlap(matrix: number[][] | undefined) {
  if (
    !matrix ||
    matrix.length < 2 ||
    matrix.some(
      (row) =>
        row.length !== matrix.length ||
        row.some((value) => !Number.isFinite(value) || value < 0 || value > 1),
    )
  )
    return null;
  return matrix.slice(0, -1).map((row, from): AdjacentOverlap => ({
    from,
    to: from + 1,
    forward: row[from + 1],
    reverse: matrix[from + 1][from],
  }));
}

export function overlapCsv(rows: AdjacentOverlap[]) {
  return [
    "from_state,to_state,forward_overlap,reverse_overlap",
    ...rows.map((row) =>
      [row.from, row.to, row.forward, row.reverse].join(","),
    ),
  ].join("\r\n");
}
