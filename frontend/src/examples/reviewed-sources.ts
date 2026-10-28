import type { ExampleInfo, ExampleJobEvidence } from "./types";

export interface ReviewedSources {
  case_id: string;
  capability_id: string;
  revision: number;
  job_id: string;
  artifacts: Record<string, string>;
  supporting: ExampleJobEvidence[];
}

/** Case interpretations never follow labels, a later revision or different coordinates. */
export function matchesReviewedSources(
  info: ExampleInfo | null,
  jobId: string,
  source: ReviewedSources,
) {
  const pin = info?.pin;
  return Boolean(
    pin?.review &&
    info?.case.id === source.case_id &&
    info.module.case_id === source.case_id &&
    info.module.capability_id === source.capability_id &&
    info.module.revision === source.revision &&
    pin.job_id === source.job_id &&
    jobId === source.job_id &&
    Object.entries(source.artifacts).every(
      ([name, digest]) => pin.artifact_sha256?.[name] === digest,
    ) &&
    source.supporting.every((expected) =>
      pin.supporting_evidence?.some(
        (actual) =>
          actual.job_id === expected.job_id &&
          Object.entries(expected.artifact_sha256).every(
            ([name, digest]) => actual.artifact_sha256?.[name] === digest,
          ),
      ),
    ),
  );
}
