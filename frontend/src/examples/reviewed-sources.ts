import type { ExampleInfo } from "./types";

export interface ReviewedSources {
  case_id: string;
  capability_id: string;
  revision: number;
  job_id: string;
  artifacts: Record<string, string>;
  supporting: {
    job_id: string;
    artifact_sha256: Record<string, unknown>;
  }[];
}

function matchesArtifacts(
  actual: Record<string, string> | undefined,
  expected: Record<string, unknown>,
) {
  return (
    Object.keys(expected).length > 0 &&
    Object.entries(expected).every(
      ([name, digest]) =>
        typeof digest === "string" &&
        /^[a-f0-9]{64}$/.test(digest) &&
        actual?.[name] === digest,
    )
  );
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
    matchesArtifacts(pin.artifact_sha256, source.artifacts) &&
    source.supporting.every((expected) =>
      pin.supporting_evidence?.some(
        (actual) =>
          actual.job_id === expected.job_id &&
          matchesArtifacts(actual.artifact_sha256, expected.artifact_sha256),
      ),
    ),
  );
}
