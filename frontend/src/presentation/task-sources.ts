import type { Job } from "../types";
/** Only a declared immutable scientific input can become a native-tool source preview. */
export function harnessSource(job: Job, field: string, index?: number) {
  if (job.request.operation !== "harness") return null;
  const input = job.request.payload[field],
    raw =
      index === undefined
        ? input
        : Array.isArray(input)
          ? input[index]
          : undefined;
  if (typeof raw !== "string" || !/^asset:[0-9a-f-]{36}$/i.test(raw))
    return null;
  return (
    job.request.scientific_inputs?.find(
      (ref) =>
        ref.asset_id === raw.slice(6) &&
        ref.record === 0 &&
        ref.conformer === 0,
    ) ?? null
  );
}
export function harnessCandidateSource(job: Job, name: string) {
  if (job.request.operation !== "harness") return null;
  const names = job.request.payload.candidate_names;
  if (!Array.isArray(names) || names.filter((n) => n === name).length !== 1)
    return null;
  return harnessSource(job, "structure_paths", names.indexOf(name));
}
