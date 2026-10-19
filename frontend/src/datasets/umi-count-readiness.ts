import type { AvailableDataset } from "./types";
import { validSequencing, type UMIIntegrity } from "./sequencing-quality";

export function umiCountingIssue(
  source?: AvailableDataset,
): "unassessed" | "undefined" | null {
  if (
    !source?.metadata?.umi_integrity ||
    !validSequencing({
      reads: source.counts.decoded_reads,
      decoded: source.counts.decoded_reads,
      mean_quality: [],
      umi_integrity: source.metadata.umi_integrity,
    })
  )
    return "unassessed";
  const quality = source.metadata.umi_integrity as UMIIntegrity;
  if (
    source.counts.complete_umi_reads !== quality.reads_by_status.complete ||
    source.counts.complete_umi_records !== quality.records_by_status.complete ||
    Object.values(quality.records_by_status).reduce((sum, n) => sum + n, 0) !==
      source.counts.distinct_umi_records
  )
    return "unassessed";
  return quality.reads_by_status.not_defined > 0 ? "undefined" : null;
}
