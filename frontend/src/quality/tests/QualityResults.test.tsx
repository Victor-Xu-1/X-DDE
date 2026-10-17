import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, it, vi } from "vitest";
import type { Job } from "../../types";
import { QualityResults } from "../QualityResults";
import type { PoseQualityResult } from "../types";
afterEach(cleanup);

const preview = vi.hoisted(() => vi.fn());
vi.mock("../../viewer/StructureViewer", () => ({
  StructureViewer: (props: unknown) => { preview(props); return <span>Real source preview</span>; },
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

it.each(["en", "zh"] as const)("shows whole-pose RMSD and a read-only exact-record experimental overlay in %s", async (language) => {
  const result = { classification: "fails", coordinate_basis: "user_confirmed",
    options: { profile: "redock", cpu: 1, memory_mib: 2048 },
    inputs: { protein: {}, molecule: {}, reference: { asset_id: "experimental", record: 7 } },
    previews_sha256: { "protein-preview.pdb": "a".repeat(64), "molecule-preview.sdf": "b".repeat(64) },
    metrics: { rmsd: 8.6789695619, kabsch_rmsd: 5.166254826, smallest_distance_protein: 2.60249064 },
    checks: [{ id: "rmsd_≤_2å", outcome: "fail" }] } as unknown as PoseQualityResult;
  render(<QualityResults job={{ id: "native" } as Job} result={result} language={language} />);
  expect(screen.getByText("8.68 Å", { exact: true })).toBeVisible();
  expect(screen.getByText(language === "zh" ? "整分子原位 RMSD" : "Whole-molecule RMSD in receptor frame")).toBeVisible();
  expect(preview).toHaveBeenLastCalledWith(expect.objectContaining({ sourceSnapshot: true }));
  await userEvent.setup().click(screen.getByRole("button", { name: language === "zh" ? "实验参考叠合" : "Experimental overlay", exact: true }));
  expect(preview).toHaveBeenLastCalledWith(expect.objectContaining({
    urls: ["/api/jobs/native/download?name=protein-preview.pdb", "/api/jobs/native/download?name=molecule-preview.sdf", "/api/assets/experimental"],
    records: [0, 0, 7], comparison: true, sourceSnapshot: true, focusModels: [1, 2],
  }));
  expect(result.metrics.rmsd).toBe(8.6789695619);
});
