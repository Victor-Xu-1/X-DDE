import { render, screen } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import type { Job } from "../../types";
import { QualityResults } from "../QualityResults";
import type { PoseQualityResult } from "../types";

vi.mock("../../viewer/StructureViewer", () => ({
  StructureViewer: () => <span>Real source preview</span>,
}));
it("keeps failed and unavailable checks distinct without fabricating a quality pass", () => {
  const result: PoseQualityResult = {
    operation: "pose_quality",
    complete: true,
    schema_version: 1,
    inputs: {},
    coordinate_basis: null,
    versions: {},
    native_config_sha256: "a".repeat(64),
    classification: "fails",
    options: { profile: "mol", cpu: 1, memory_mib: 2048 },
    checks: [
      { id: "bond_lengths", outcome: "fail" },
      { id: "internal_energy", outcome: "unavailable" },
    ],
    metrics: {},
    previews_sha256: { "molecule-preview.sdf": "a".repeat(64) },
  };
  render(
    <QualityResults job={{ id: "job" } as Job} result={result} language="zh" />,
  );
  expect(screen.getByText("未能计算", { exact: true })).toBeVisible();
  expect(screen.getByText("需要复核", { exact: true })).toBeVisible();
  expect(
    screen.queryByText("已通过全部适用检查", { exact: false }),
  ).not.toBeInTheDocument();
  expect(screen.getByRole("link", { name: "下载质控报告" })).toHaveAttribute(
    "href",
    "/api/jobs/job/download?name=result.json",
  );
});
