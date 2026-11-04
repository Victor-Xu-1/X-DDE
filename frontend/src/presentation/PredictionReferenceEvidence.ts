import { useEffect, useState } from "react";
import { artifactUrl, request } from "../api";
import { matchesReviewedSources } from "../examples/reviewed-sources";
import type { ExampleInfo } from "../examples/types";
import type {
  NativeCandidate,
  NativeInteraction,
  NativeResult,
} from "../integrations/types";
import { nativeInteractions } from "../viewer/scientific-data";
import { readArtifactFile } from "./artifact-file";

const contactJob = "a5773abd-8315-49f7-ab66-7df445c39d45";
const contactStructure = "interaction-structure.cif";
const contactResult =
  "92dae30d98f85f85fa628bac3f89631f034d8bc2c0717170cc6f176f20157e91";
const reviewedStructure = "structure-003.cif";
export const predictionReferenceSources = {
  case_id: "stat6-defined-molecules",
  capability_id: "boltz.predict",
  revision: 3,
  job_id: "1190e938-51af-44a3-9dbc-4aacc77b5821",
  artifacts: {
    "result.json":
      "b13d6664dcea2876b91e712cb80dafbbb038781d7f05739e9cb7800498c46d28",
    "structure-001.cif":
      "ba688f7826d16fbf69490efa6f71ccc114dac92f032027a2cfd392a640fe1a53",
    "structure-002.cif":
      "30e9e7d74df5e79c55058b2bf4cf80eef497f2964bdec06deed5d32894ddc878",
    [reviewedStructure]:
      "dc4450f8f061bce82bfd3c69330da1af4d86b20f7bd8af46435e936d151d72cf",
  },
  supporting: [
    {
      job_id: contactJob,
      artifact_sha256: {
        "result.json": contactResult,
        [contactStructure]:
          "dc4450f8f061bce82bfd3c69330da1af4d86b20f7bd8af46435e936d151d72cf",
      },
    },
  ],
};
const expected = [
  { id: "structure-001", artifact: "structure-001.cif" },
  { id: "structure-002", artifact: "structure-002.cif" },
  { id: "structure-003", artifact: reviewedStructure },
] as const;
const reviewedCandidate = expected[2].id;

export type PredictionReferenceEvidence = {
  candidate: string;
  omittedDomainClash: boolean;
  contacts: NativeInteraction[] | undefined;
  contactsPending: boolean;
  contactJob?: string;
  reviewedCandidate: string;
};

function boundCase(job: string, result: NativeResult) {
  return (
    job === predictionReferenceSources.job_id &&
    result.operation === "boltz_predict" &&
    result.program === "boltz" &&
    result.candidates.length === expected.length &&
    expected.every(
      ({ id, artifact }) =>
        result.candidates.some(
          (row) => row.id === id && row.artifact === artifact,
        ) &&
        result.artifact_sha256[artifact] ===
          predictionReferenceSources.artifacts[artifact],
    )
  );
}

/** Preserve the archived assessment and show contacts only in their exact native frame. */
export function usePredictionReferenceReview(
  job: string,
  result: NativeResult,
  active?: NativeCandidate,
): PredictionReferenceEvidence | null {
  const eligible = boundCase(job, result);
  const [verified, setVerified] = useState<{
    job: string;
    result: NativeResult;
    pending: boolean;
    contacts?: NativeInteraction[];
  } | null>(null);

  useEffect(() => {
    if (!eligible) return;
    const controller = new AbortController();
    const signal = AbortSignal.any([
      controller.signal,
      AbortSignal.timeout(12000),
    ]);
    async function load() {
      try {
        const info = await request<ExampleInfo>("/examples/boltz.predict", {
          signal,
        });
        if (
          signal.aborted ||
          !matchesReviewedSources(info, job, predictionReferenceSources)
        )
          return;
        setVerified({ job, result, pending: true });
        const { bytes } = await readArtifactFile(
          artifactUrl(contactJob, "result.json"),
          signal,
          {
            maxBytes: 2 * 1024 ** 2,
            sha256: contactResult,
          },
        );
        const report = JSON.parse(
          new TextDecoder().decode(bytes),
        ) as NativeResult & { complete?: unknown };
        if (
          report.operation !== "interaction_profile" ||
          report.complete !== true ||
          report.program !== "plip" ||
          report.structure_artifact !== contactStructure ||
          report.artifact_sha256[contactStructure] !==
            predictionReferenceSources.artifacts[reviewedStructure]
        )
          throw new Error(
            "The retained contact report uses another structure.",
          );
        const contacts = nativeInteractions(report.interactions);
        if (!contacts?.length)
          throw new Error("The retained contact report has no validated rows.");
        if (!signal.aborted)
          setVerified({ job, result, pending: false, contacts });
      } catch {
        if (!controller.signal.aborted)
          setVerified((current) =>
            current?.job === job && current.result === result
              ? { job, result, pending: false }
              : null,
          );
      }
    }
    void load();
    return () => controller.abort();
  }, [eligible, job, result]);

  if (
    !eligible ||
    verified?.job !== job ||
    verified.result !== result ||
    !active ||
    !expected.some(
      (row) => row.id === active.id && row.artifact === active.artifact,
    )
  )
    return null;
  const contacts =
    active.id === reviewedCandidate ? verified.contacts : undefined;
  return {
    candidate: active.id,
    omittedDomainClash: active.id !== reviewedCandidate,
    contacts,
    contactsPending: active.id === reviewedCandidate && verified.pending,
    contactJob: contacts ? contactJob : undefined,
    reviewedCandidate,
  };
}
