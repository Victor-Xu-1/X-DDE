import { expect, it } from "vitest";
import { optimizedPose, poseSource } from "./pose-source";
import type { PreviewPose, SavedPose } from "./pose-types";

const id = "7b9bd02b-0b93-45f4-a8b9-80e1cff203c9";
it("resolves only exact same-origin native files and SDF records", () => {
  expect(poseSource(`/api/assets/${id}`, 3)).toEqual({
    kind: "asset",
    asset_id: id,
    record: 3,
  });
  expect(poseSource(`/api/jobs/${id}/download?name=pose-001.sdf`)).toEqual({
    kind: "artifact",
    job_id: id,
    name: "pose-001.sdf",
    record: 0,
  });
  for (const value of [
    "http://untrusted.example/api/assets/" + id,
    "/api/assets/not-uuid",
    `/api/jobs/${id}/download?name=a&name=b`,
  ])
    expect(poseSource(value)).toBeNull();
  expect(poseSource(`/api/assets/${id}`, -1)).toBeNull();
});

it("replaces only the ligand with the saved version and clears stale docking scores", () => {
  const base: PreviewPose = {
    urls: ["/api/assets/receptor", "/api/assets/old-pose"],
    records: [0, 4],
    source: { kind: "asset", asset_id: id, record: 4 },
    receptor: { kind: "asset", asset_id: id, record: 0 },
    score: {
      value: -6,
      scope: "whole_pose",
      method: "GNINA",
      unit: "kcal/mol",
    },
  };
  const saved = {
    job_id: id,
    pose: {
      id,
      kind: "molecule",
      reference: { asset_id: id, version_id: id, record: 0, conformer: 0 },
      source_job: id,
      relation: "edited_from",
    },
    energy: null,
    native_score: null,
    receptor: null,
  } as SavedPose;
  const next = optimizedPose(base, saved, 1);
  expect(next.urls).toEqual([base.urls[0], `/api/assets/${id}`]);
  expect(next.records).toEqual([0, 0]);
  expect(next.score).toBeNull();
  expect(base.records).toEqual([0, 4]);
  expect(() =>
    optimizedPose(
      base,
      { ...saved, pose: { ...saved.pose, source_job: "wrong" } },
      1,
    ),
  ).toThrow();
});
