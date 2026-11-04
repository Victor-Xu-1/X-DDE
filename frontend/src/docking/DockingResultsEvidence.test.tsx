import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { DockingResultsEvidence } from "./DockingResultsEvidence";
import type { DockingResult, PoseResult } from "./types";

const mocks = vi.hoisted(() => ({ request: vi.fn(), read: vi.fn() }));
vi.mock("../api", () => ({
  request: mocks.request,
  artifactUrl: (id: string, name: string) => "/api/jobs/" + id + "/" + name,
}));
vi.mock("../presentation/artifact-file", () => ({
  readArtifactFile: mocks.read,
}));

const receptor = {
  asset_id: "receptor",
  sha256: "a".repeat(64),
  record: 0,
  conformer: 0,
  version_id: "prepared",
};
const pose1: PoseResult = {
  record: 0,
  valid: true,
  artifact: "pose-001.sdf",
  mapping_status: "native_atom_maps",
  scores: [],
};
const pose3 = { ...pose1, record: 2, artifact: "pose-003.sdf" };
const result: DockingResult = {
  operation: "docking",
  complete: true,
  mode: "dock",
  receptor,
  ligand: receptor,
  software_version: "1.3.3",
  pose_artifact: "poses.sdf",
  receptor_artifact: "receptor.pdb",
  scientific_outcome: "candidates",
  poses: [pose3, pose1],
};
const poseDigest = "b".repeat(64);
const reportDigest = "c".repeat(64);
const info = {
  pin: {
    job_id: "source",
    review: { scope: "reviewed_computational_example" },
    artifact_sha256: {
      "receptor.pdb": receptor.sha256,
      [pose3.artifact]: poseDigest,
    },
    supporting_evidence: [
      { job_id: "quality", artifact_sha256: { "result.json": reportDigest } },
    ],
  },
};
const report = {
  operation: "pose_quality",
  complete: true,
  options: { profile: "dock" },
  inputs: {
    protein: receptor,
    molecule: {
      ...receptor,
      asset_id: "pose",
      sha256: poseDigest,
      version_id: "native-pose",
    },
  },
  checks: [
    { id: "sanitization", outcome: "pass" },
    { id: "minimum_distance_to_waters", outcome: "pass" },
  ],
  metrics: {},
  versions: { posebusters: "0.6.5" },
};

function evidence(value = report) {
  mocks.request.mockResolvedValue(info);
  mocks.read.mockResolvedValue({
    bytes: new TextEncoder().encode(JSON.stringify(value)),
  });
}
function view(
  pose: PoseResult,
  jobId = "source",
  language: "en" | "zh" = "en",
) {
  return (
    <DockingResultsEvidence
      jobId={jobId}
      result={result}
      pose={pose}
      language={language}
    />
  );
}

afterEach(() => {
  cleanup();
  vi.resetAllMocks();
});

it("attaches the exact verified report and never transfers it to another pose or job", async () => {
  evidence();
  const { rerender } = render(view(pose3));
  const link = await screen.findByRole("link", {
    name: "View report · PoseBusters 0.6.5",
  });
  expect(link).toHaveAttribute("href", "/#task=quality");
  expect(screen.getByText("1 passed")).toBeVisible();
  expect(screen.getByText("1 not assessed")).toBeVisible();
  expect(mocks.read).toHaveBeenCalledWith(
    "/api/jobs/quality/result.json",
    expect.any(AbortSignal),
    { maxBytes: 4 * 1024 ** 2, sha256: reportDigest },
  );
  rerender(view(pose1));
  expect(
    screen.getByText(/No independent quality report is linked/),
  ).toBeVisible();
  expect(screen.queryByRole("link")).toBeNull();
  rerender(view(pose3, "unrelated"));
  expect(screen.queryByRole("region")).toBeNull();
  expect(mocks.read).toHaveBeenCalledTimes(1);
});

it("never accepts another receptor version despite identical coordinate bytes", async () => {
  evidence({
    ...report,
    inputs: { ...report.inputs, protein: { ...receptor, version_id: "other" } },
  });
  render(view(pose3, "source", "zh"));
  await waitFor(() => expect(mocks.read).toHaveBeenCalledOnce());
  expect(screen.queryByRole("region")).toBeNull();
});

it("never reports a quality verdict after an artifact digest failure", async () => {
  evidence();
  mocks.read.mockRejectedValue(
    new Error("The declared research output bytes changed."),
  );
  render(view(pose3));
  await waitFor(() => expect(mocks.read).toHaveBeenCalledOnce());
  expect(screen.queryByRole("region")).toBeNull();
});
