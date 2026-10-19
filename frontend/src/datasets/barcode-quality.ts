import { csvCell } from "../presentation/table-model";

export interface BarcodeCycleQuality {
  set: string;
  members: number;
  barcodes?: number | null;
  valid_structures?: number | null;
  minimum_observed_hamming_distance?: number | null;
  pair_checks?: number | null;
  complete_pair_review?: boolean | null;
  one_error_correction_uniquely_supported?: boolean | null;
}

const count = (value: unknown): value is number =>
  typeof value === "number" && Number.isSafeInteger(value) && value >= 0;

export function validBarcodeCycle(
  value: unknown,
): value is BarcodeCycleQuality {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const row = value as Record<string, unknown>;
  if (typeof row.set !== "string" || !count(row.members)) return false;
  for (const key of [
    "barcodes",
    "valid_structures",
    "pair_checks",
    "minimum_observed_hamming_distance",
  ])
    if (row[key] != null && !count(row[key])) return false;
  for (const key of [
    "complete_pair_review",
    "one_error_correction_uniquely_supported",
  ])
    if (row[key] != null && typeof row[key] !== "boolean") return false;
  if (count(row.barcodes) && row.barcodes > row.members) return false;
  if (count(row.valid_structures) && row.valid_structures > row.members)
    return false;
  const tags = count(row.barcodes) ? row.barcodes : row.members;
  const pairs = (tags * (tags - 1)) / 2;
  if (!Number.isSafeInteger(pairs)) return false;
  if (
    count(row.pair_checks) &&
    (row.pair_checks > pairs ||
      (row.complete_pair_review === true && row.pair_checks !== pairs))
  )
    return false;
  if (
    row.one_error_correction_uniquely_supported === true &&
    !(
      count(row.barcodes) &&
      tags > 1 &&
      row.complete_pair_review === true &&
      row.pair_checks === pairs &&
      count(row.minimum_observed_hamming_distance) &&
      row.minimum_observed_hamming_distance >= 3
    )
  )
    return false;
  return true;
}

export function barcodeSeparation(row: BarcodeCycleQuality) {
  if (row.complete_pair_review === false) return "incomplete";
  if (
    row.barcodes == null ||
    row.minimum_observed_hamming_distance == null ||
    row.pair_checks == null ||
    row.complete_pair_review == null ||
    row.one_error_correction_uniquely_supported == null
  )
    return "unassessed";
  return row.one_error_correction_uniquely_supported &&
    row.minimum_observed_hamming_distance >= 3
    ? "separated"
    : "review";
}

/** Export native scalars and missing values; never replace missing evidence with zero. */
export function barcodeQualityCsv(job: string, cycles: BarcodeCycleQuality[]) {
  const fields = [
    "set",
    "members",
    "barcodes",
    "valid_structures",
    "minimum_observed_hamming_distance",
    "pair_checks",
    "complete_pair_review",
    "one_error_correction_uniquely_supported",
  ] as const;
  return (
    "\uFEFF" +
    [
      ["dataset_job", ...fields].map(csvCell).join(","),
      ...cycles.map((row) =>
        [job, ...fields.map((key) => row[key])].map(csvCell).join(","),
      ),
    ].join("\r\n")
  );
}
