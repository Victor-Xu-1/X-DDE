import { renderHook, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import type { NativeResult } from "../integrations/types";
import {
  predictionReferenceSources as sources,
  usePredictionReferenceReview,
} from "./PredictionReferenceEvidence";

const mocks = vi.hoisted(() => ({ request: vi.fn(), read: vi.fn() }));
vi.mock("../api", () => ({
  request: mocks.request,
  artifactUrl: (job: string, name: string) => "/api/jobs/" + job + "/" + name,
}));
vi.mock("./artifact-file", () => ({ readArtifactFile: mocks.read }));

const rows = ["001", "002", "003"].map((value) => ({
  id: "structure-" + value,
  artifact: "structure-" + value + ".cif",
  metrics: [],
  geometry: "predicted_structure" as const,
}));
const result: NativeResult = {
  operation: "boltz_predict",
  program: "boltz",
  version: "2",
  metrics: [],
  interactions: [],
  validation_points: [],
  candidates: rows,
  artifact_sha256: sources.artifacts,
};
const info = {
  case: { id: sources.case_id },
  module: {
    case_id: sources.case_id,
    capability_id: sources.capability_id,
    revision: sources.revision,
  },
  pin: {
    review: { scope: "reviewed_computational_example" },
    job_id: sources.job_id,
    artifact_sha256: sources.artifacts,
    supporting_evidence: sources.supporting,
  },
};
const report = {
  operation: "interaction_profile",
  program: "plip",
  complete: true,
  structure_artifact: "interaction-structure.cif",
  artifact_sha256: {
    "interaction-structure.cif": sources.artifacts["structure-003.cif"],
  },
  interactions: [
    {
      kind: "hydrogen_bond",
      chain: "A",
      residue: "GLN",
      number: 74,
      distance: 3.77,
      protein_position: [0, 0, 0],
      ligand_position: [3.77, 0, 0],
    },
  ],
};
const reportBytes = (value: unknown) => ({
  bytes: new TextEncoder().encode(JSON.stringify(value)),
});

afterEach(() => vi.resetAllMocks());

it("keeps experimental warnings and native contact coordinates on the exact samples", async () => {
  mocks.request.mockResolvedValue(info);
  mocks.read.mockResolvedValue(reportBytes(report));
  const { result: current, rerender } = renderHook(
    ({ index }) =>
      usePredictionReferenceReview(sources.job_id, result, rows[index]),
    { initialProps: { index: 2 } },
  );
  await waitFor(() =>
    expect(current.current?.contacts).toEqual(report.interactions),
  );
  expect(current.current?.omittedDomainClash).toBe(false);
  expect(mocks.read).toHaveBeenCalledWith(
    expect.stringContaining(sources.supporting[0].job_id),
    expect.any(AbortSignal),
    {
      maxBytes: 2 * 1024 ** 2,
      sha256: sources.supporting[0].artifact_sha256["result.json"],
    },
  );
  rerender({ index: 0 });
  expect(current.current).toMatchObject({
    candidate: "structure-001",
    omittedDomainClash: true,
    contacts: undefined,
    contactJob: undefined,
  });
  rerender({ index: 2 });
  expect(current.current?.contacts).toEqual(report.interactions);
});

it("rejects a known result whose current structure receipt no longer matches", () => {
  const wrong = {
    ...result,
    artifact_sha256: {
      ...result.artifact_sha256,
      "structure-003.cif": "other",
    },
  };
  const { result: current } = renderHook(() =>
    usePredictionReferenceReview(sources.job_id, wrong, rows[2]),
  );
  expect(current.current).toBeNull();
  expect(mocks.request).not.toHaveBeenCalled();
});

it("fails closed if the verified contact report references another structure", async () => {
  mocks.request.mockResolvedValue(info);
  mocks.read.mockResolvedValue(
    reportBytes({
      ...report,
      artifact_sha256: { "interaction-structure.cif": "different" },
    }),
  );
  const { result: current } = renderHook(() =>
    usePredictionReferenceReview(sources.job_id, result, rows[2]),
  );
  await waitFor(() => expect(current.current?.contactsPending).toBe(false));
  expect(current.current?.contacts).toBeUndefined();
  expect(current.current?.contactJob).toBeUndefined();
});
