import type { Job, LigandProperties } from "../types";

/** Native input IDs retain file identity and a one-based record, not row order. */
export function propertySource(job: Job, molecule: LigandProperties) {
  const match =
    /^([0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}):([1-9]\d*)$/i.exec(
      molecule.input,
    );
  if (
    !match ||
    job.request.operation !== "properties" ||
    !("ligand_files" in job.request) ||
    !job.request.ligand_files?.includes(match[1])
  )
    return null;
  const oneBased = Number(match[2]);
  if (!Number.isSafeInteger(oneBased)) return null;
  const record = oneBased - 1;
  return { url: `/api/assets/${match[1]}`, record };
}
