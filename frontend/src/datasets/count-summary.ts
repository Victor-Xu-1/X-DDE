import type { DatasetResult } from "./types";

export interface SampleCountSummary {
  sample: string;
  raw: number;
  unique: number | null;
  corrected: number | null;
}
/** Whitelisted native scientific summary, reconciled with the reported sample/read counts. */
export function countSummary(
  result: DatasetResult,
): SampleCountSummary[] | null {
  if (
    result.operation !== "del_count" ||
    result.program !== "deli" ||
    result.data_kind !== "counts"
  )
    return null;
  const value = result.metadata.sample_totals;
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const validCount = (n: unknown): n is number =>
    typeof n === "number" && Number.isSafeInteger(n) && n >= 0;
  const rows: SampleCountSummary[] = [];
  for (const [sample, entry] of Object.entries(value)) {
    if (!entry || typeof entry !== "object" || Array.isArray(entry))
      return null;
    const data = entry as Record<string, unknown>;
    if (
      !validCount(data.raw) ||
      !(data.unique_umi === null || validCount(data.unique_umi)) ||
      !(data.corrected_umi === null || validCount(data.corrected_umi)) ||
      (data.unique_umi !== null && data.unique_umi > data.raw) ||
      (data.corrected_umi !== null &&
        (data.unique_umi === null || data.corrected_umi > data.unique_umi))
    )
      return null;
    rows.push({
      sample,
      raw: data.raw,
      unique: data.unique_umi,
      corrected: data.corrected_umi,
    });
  }
  if (
    !rows.length ||
    rows.length !== result.counts.samples ||
    rows.reduce((sum, row) => sum + row.raw, 0) !== result.counts.counted_reads
  )
    return null;
  return rows;
}
