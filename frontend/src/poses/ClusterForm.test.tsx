import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, it, vi } from "vitest";
import * as client from "../api";
import { ClusterForm } from "./ClusterForm";
import type { PoseSet } from "./types";
vi.mock("../guided/useTaskReadiness", () => ({
  useTaskReadiness: () => ({ ready: true, error: "" }),
}));
const value = {
  id: "controlled-set",
  outcomes: [
    {
      combination: {
        step_id: "pose_000",
        member_index: 0,
        pocket_rank: 1,
        seed: 2026,
      },
      poses: [0, 1].map((record) => ({
        reference: { asset_id: "controlled-" + record },
        evidence: { record },
      })),
    },
  ],
} as unknown as PoseSet;
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});
it("requires explicit pose choice and final review before preparing and submitting one real task", async () => {
  const compiled = { operation: "pose_cluster", name: "controlled", poses: [] };
  const prepare = vi.spyOn(client.api, "post").mockResolvedValue(compiled);
  const submit = vi
    .spyOn(client.api, "submit")
    .mockResolvedValue({ id: "new-analysis" } as never);
  const user = userEvent.setup();
  render(<ClusterForm value={value} language="zh" />);
  expect(screen.getByRole("button", { name: "RDKit 默认" })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  expect(screen.getByRole("button", { name: "下一步" })).toBeDisabled();
  await user.click(screen.getByRole("button", { name: "全选" }));
  await user.click(screen.getByRole("button", { name: "下一步" }));
  expect(submit).not.toHaveBeenCalled();
  await user.click(screen.getByRole("button", { name: "下一步" }));
  await user.click(screen.getByRole("radio", { name: "精细" }));
  await user.click(screen.getByRole("button", { name: "下一步" }));
  await user.type(
    screen.getByRole("textbox", { name: "分析名称" }),
    "BRD4 mode review",
  );
  await user.click(screen.getByRole("button", { name: "开始分群" }));
  await waitFor(() => expect(submit).toHaveBeenCalledTimes(1));
  expect(prepare).toHaveBeenCalledWith(
    "/research/pose-ensembles/controlled-set/clustering-request",
    expect.objectContaining({
      name: "BRD4 mode review",
      selections: [
        { step_id: "pose_000", record: 0 },
        { step_id: "pose_000", record: 1 },
      ],
      options: expect.objectContaining({
        maximum_rmsd_angstrom: 1,
        minimum_contact_jaccard: 0.7,
      }),
    }),
  );
  expect(submit.mock.calls[0][0]).toEqual(compiled);
  expect(
    screen.getByRole("link", { name: "查看任务进度与结果" }),
  ).toHaveAttribute("href", "/#task=new-analysis");
});
