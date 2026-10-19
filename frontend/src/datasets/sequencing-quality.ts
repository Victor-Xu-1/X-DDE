export const umiStates = [
  "complete",
  "truncated",
  "too_long",
  "ambiguous",
  "missing",
  "not_defined",
] as const;
export type UMIState = (typeof umiStates)[number];
export interface UMIIntegrity {
  schema_version: 1;
  scope: "within_sample_library_and_compound";
  expected_lengths: Record<string, number | null>;
  reads_by_status: Record<UMIState, number>;
  records_by_status: Record<UMIState, number>;
}
export interface SequencingDocument {
  reads: number;
  decoded: number;
  mean_quality: number[];
  bases?: number;
  q30_fraction?: number;
  lengths?: { length: number; reads: number }[];
  failures?: Record<string, number>;
  umi_integrity?: UMIIntegrity;
}
const object = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);
const count = (v: unknown): v is number =>
  typeof v === "number" && Number.isSafeInteger(v) && v >= 0;

export function validSequencing(value: Record<string, unknown>) {
  if (
    !count(value.reads) ||
    !count(value.decoded) ||
    value.decoded > value.reads ||
    !Array.isArray(value.mean_quality) ||
    !value.mean_quality.every(
      (n) => typeof n === "number" && Number.isFinite(n) && n >= 0,
    )
  )
    return false;
  const qualities = value.mean_quality;
  if (value.bases !== undefined && !count(value.bases)) return false;
  if (
    value.q30_fraction !== undefined &&
    (typeof value.q30_fraction !== "number" ||
      !Number.isFinite(value.q30_fraction) ||
      value.q30_fraction < 0 ||
      value.q30_fraction > 1)
  )
    return false;
  if (
    value.failures !== undefined &&
    (!object(value.failures) ||
      !Object.values(value.failures).every(count) ||
      Object.values(value.failures).reduce<number>(
        (a, b) => a + Number(b),
        0,
      ) !==
        value.reads - value.decoded)
  )
    return false;
  if (value.lengths !== undefined) {
    if (
      !Array.isArray(value.lengths) ||
      !value.lengths.every(
        (row) =>
          object(row) &&
          count(row.length) &&
          row.length > 0 &&
          count(row.reads) &&
          row.reads > 0,
      ) ||
      new Set(value.lengths.map((row) => row.length)).size !==
        value.lengths.length ||
      value.lengths.reduce((sum, row) => sum + row.reads, 0) !== value.reads ||
      (value.bases !== undefined &&
        value.lengths.reduce((sum, row) => sum + row.length * row.reads, 0) !==
          value.bases) ||
      (value.lengths.length > 0 &&
        qualities.length >
          value.lengths.reduce(
            (maximum, row) => Math.max(maximum, row.length),
            0,
          ))
    )
      return false;
  }
  if (value.umi_integrity !== undefined) {
    const umi = value.umi_integrity;
    if (
      !object(umi) ||
      umi.schema_version !== 1 ||
      umi.scope !== "within_sample_library_and_compound" ||
      !object(umi.expected_lengths) ||
      !Object.keys(umi.expected_lengths).length ||
      !Object.values(umi.expected_lengths).every(
        (n) => n === null || (count(n) && n >= 1 && n <= 100),
      )
    )
      return false;
    const reads = umi.reads_by_status,
      records = umi.records_by_status;
    if (
      !object(reads) ||
      !object(records) ||
      [reads, records].some(
        (rows) =>
          Object.keys(rows).length !== umiStates.length ||
          !umiStates.every((key) => count(rows[key])),
      ) ||
      umiStates.reduce((sum, key) => sum + (reads[key] as number), 0) !==
        value.decoded ||
      umiStates.some(
        (key) =>
          Number(records[key]) > Number(reads[key]) ||
          Boolean(records[key]) !== Boolean(reads[key]),
      )
    )
      return false;
  }
  return true;
}

/** Position coverage is derived exactly from the reported length histogram. */
export function positionCoverage(document: SequencingDocument) {
  // Historical native QC does not include reads longer than 5,000 bases in its
  // position means. Without explicit per-position coverage, keep those counts unknown.
  if (!document.lengths || document.lengths.some((row) => row.length > 5000))
    return undefined;
  const changes = Array(document.mean_quality.length + 1).fill(0) as number[];
  for (const row of document.lengths) changes[row.length] += row.reads;
  let remaining = document.reads;
  return document.mean_quality.map((_, i) => {
    remaining -= changes[i];
    return remaining;
  });
}

export function umiStateLabel(value: unknown, zh: boolean) {
  const labels: Record<UMIState, [string, string]> = {
    complete: ["长度完整", "Complete length"],
    truncated: ["长度不足", "Truncated"],
    too_long: ["长度超出", "Too long"],
    ambiguous: ["存在不确定碱基", "Ambiguous bases"],
    missing: ["未读出 UMI", "Missing UMI"],
    not_defined: ["库未定义 UMI", "No UMI defined"],
  };
  return (
    labels[value as UMIState]?.[zh ? 0 : 1] ??
    (zh ? "完整性未评估" : "Not assessed")
  );
}
