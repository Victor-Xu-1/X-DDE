import { expect, it } from "vitest";
import { poseDownloadUrl } from "./pose-download";
import type { PreviewPose } from "./pose-types";

const id = "00000000-0000-4000-8000-000000000001";
it("downloads the selected saved ensemble record, including record zero", () => {
  const pose: PreviewPose = {
    urls: [
      "/api/assets/00000000-0000-4000-8000-000000000002",
      `/api/assets/${id}`,
    ],
    records: [0, 9],
    source: { kind: "version", version_id: id },
    receptor: null,
  };
  expect(poseDownloadUrl(pose, 1)).toBe(`/api/assets/${id}?record=9`);
  expect(poseDownloadUrl({ ...pose, records: [0, 0] }, 1)).toBe(
    `/api/assets/${id}?record=0`,
  );
});
it("retains the source's exact record on undo before a saved optimization", () => {
  expect(
    poseDownloadUrl(
      {
        urls: [`/api/assets/${id}`],
        source: { kind: "asset", asset_id: id, record: 2 },
        receptor: null,
      },
      0,
    ),
  ).toBe(`/api/assets/${id}?record=2`);
});
it("keeps exact native artifact URLs separate from saved asset record downloads", () => {
  const url = `/api/jobs/${id}/download?name=pose-002.sdf`;
  expect(
    poseDownloadUrl(
      { urls: [url], records: [0], source: null, receptor: null },
      0,
    ),
  ).toBe(url);
});
