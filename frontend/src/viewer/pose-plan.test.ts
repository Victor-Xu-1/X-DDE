import { expect, it } from "vitest";
import { posePlan } from "./pose-plan";

it("keeps exact source selection separate from its editable pose session", () => {
  const id = "7b9bd02b-0b93-45f4-a8b9-80e1cff203c9";
  const frame = { urls: [`/api/assets/${id}`], records: [2] };
  const editable = posePlan(frame);
  expect(editable.base.source).toEqual({
    kind: "asset",
    asset_id: id,
    record: 2,
  });
  const source = posePlan({ ...frame, sourceSnapshot: true });
  expect(source.base.urls).toEqual(frame.urls);
  expect(source.base.records).toEqual([2]);
  expect(source.base.source).toBeNull();
  expect(source.base.receptor).toBeNull();
  expect(source.key).not.toBe(editable.key);
});

it("binds a native proof to one immutable artifact and rejects proofs for overlays or other records", () => {
  const url =
    "/api/jobs/7b9bd02b-0b93-45f4-a8b9-80e1cff203c9/download?name=conformer-001.sdf";
  const nativeArtifactSha256 = "c".repeat(64);
  const frame = { urls: [url], records: [0], nativeArtifactSha256 };
  expect(posePlan(frame).base.nativeArtifactSha256).toBe(nativeArtifactSha256);
  expect(
    posePlan({ ...frame, records: [1] }).base.nativeArtifactSha256,
  ).toBeUndefined();
  const selected = posePlan({
    ...frame,
    records: [2],
    nativeArtifactRecord: 2,
  });
  expect(selected.base.nativeArtifactSha256).toBe(nativeArtifactSha256);
  expect(selected.base.source).toMatchObject({ kind: "artifact", record: 2 });
  expect(selected.key).not.toBe(posePlan(frame).key);
  expect(
    posePlan({ ...frame, records: [1], nativeArtifactRecord: 2 }).base
      .nativeArtifactSha256,
  ).toBeUndefined();
  expect(
    posePlan({ ...frame, records: [500], nativeArtifactRecord: 500 }).base
      .nativeArtifactSha256,
  ).toBeUndefined();
  expect(
    posePlan({ ...frame, urls: [url, url] }).base.nativeArtifactSha256,
  ).toBeUndefined();
  expect(
    posePlan({ ...frame, nativeArtifactSha256: "invalid" }).base
      .nativeArtifactSha256,
  ).toBeUndefined();
});
