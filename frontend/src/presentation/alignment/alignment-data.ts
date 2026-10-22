/** Native A3M bytes remain immutable; this projection shows query match columns. */
export interface AlignmentFile {
  artifact: string;
  sha256: string;
  bytes: number;
  rows: number;
  columns: number;
}
export const alignmentByteLimit = 25 * 1024 ** 2;
export function alignmentFiles(value: unknown): AlignmentFile[] {
  if (!Array.isArray(value) || value.length > 8)
    throw new Error("Invalid alignment manifest.");
  const names = new Set<string>();
  return value.map((item) => {
    if (
      !item ||
      typeof item !== "object" ||
      typeof item.artifact !== "string" ||
      !/^[a-zA-Z0-9_.-]+\.a3m$/.test(item.artifact) ||
      names.has(item.artifact) ||
      !/^[a-f0-9]{64}$/.test(item.sha256) ||
      !Number.isSafeInteger(item.bytes) ||
      item.bytes < 1 ||
      item.bytes > alignmentByteLimit ||
      !Number.isSafeInteger(item.rows) ||
      item.rows < 1 ||
      item.rows > 50000 ||
      !Number.isSafeInteger(item.columns) ||
      item.columns < 1 ||
      item.columns > 10000 ||
      item.rows * item.columns > 30000000
    )
      throw new Error(
        "This alignment cannot be safely previewed; download the original file.",
      );
    names.add(item.artifact);
    return {
      artifact: item.artifact,
      sha256: item.sha256,
      bytes: item.bytes,
      rows: item.rows,
      columns: item.columns,
    };
  });
}
export interface AlignmentProjection {
  fasta: string;
  labels: Record<string, string>;
  rows: number;
  columns: number;
}
export function projectAlignment(
  text: string,
  file: AlignmentFile,
  query: string,
): AlignmentProjection {
  if (
    !query ||
    !/^[A-Z]+$/.test(query) ||
    query.length !== file.columns ||
    text.includes("\0")
  )
    throw new Error("The alignment does not match this task's query.");
  const records: { label: string; sequence: string }[] = [];
  let current: { label: string; sequence: string } | undefined;
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) continue;
    if (line.startsWith(">")) {
      if (current) records.push(current);
      if (
        records.length >= file.rows ||
        line.length > 4096 ||
        !line.slice(1).trim()
      )
        throw new Error("Invalid alignment record.");
      current = { label: line.slice(1).trim(), sequence: "" };
    } else {
      if (!current || !/^[A-Za-z.-]+$/.test(line))
        throw new Error("Invalid A3M residues.");
      current.sequence += line.replace(/[a-z.]/g, "");
      if (current.sequence.length > file.columns)
        throw new Error("Invalid alignment width.");
    }
  }
  if (current) records.push(current);
  if (
    records.length !== file.rows ||
    records[0]?.sequence !== query ||
    records.some((record) => record.sequence.length !== file.columns)
  )
    throw new Error(
      "The alignment rows, columns or query differ from the native report.",
    );
  const labels: Record<string, string> = {};
  const fasta =
    records
      .map((record, index) => {
        // A viewer indexes by FASTA id; prefix every row to retain repeated native ids.
        const id = `${index + 1}|${record.label.split(/\s/)[0]}`;
        labels[id] = record.label;
        return `>${id}\n${record.sequence}`;
      })
      .join("\n") + "\n";
  return { fasta, labels, rows: records.length, columns: file.columns };
}
