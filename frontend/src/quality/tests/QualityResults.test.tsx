import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, it, vi } from "vitest";
import type { Job } from "../../types";
import { QualityResults } from "../QualityResults";
import type { PoseQualityResult } from "../types";
afterEach(cleanup);

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
  expect(screen.getByText("Real source preview")).toBeVisible();
  expect(screen.queryByRole("link", { name: "下载质控报告" })).toBeNull();
  expect(screen.queryByText(/原始指标与来源|native_config_sha256/)).toBeNull();
});

it("keeps all check categories reachable and never treats a missing preview or check as a pass", async () => {
  const result = {
    classification: "incomplete",
    inputs: {},
    previews_sha256: {},
    checks: [
      { id: "bond_lengths", outcome: "pass" },
      { id: "bond_angles", outcome: "fail" },
      { id: "internal_energy", outcome: "unavailable" },
    ],
  } as unknown as PoseQualityResult;
  const user = userEvent.setup();
  render(
    <QualityResults job={{ id: "job" } as Job} result={result} language="en" />,
  );
  expect(
    screen.getByText("This quality result contains no preview structure."),
  ).toBeVisible();
  const table = screen.getByRole("table", { name: "Quality check outcomes" });
  expect(within(table).getAllByRole("row")).toHaveLength(4);
  await user.selectOptions(
    screen.getByRole("combobox", { name: "Which checks?" }),
    "unavailable",
  );
  expect(within(table).getAllByRole("row")).toHaveLength(2);
  expect(within(table).getByText("Not calculated")).toBeVisible();
  expect(within(table).queryByText("Pass")).toBeNull();
  expect(screen.queryByText("Real source preview")).toBeNull();
});
