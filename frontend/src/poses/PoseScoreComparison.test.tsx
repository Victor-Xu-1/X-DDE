import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, it, vi } from "vitest";
import * as client from "../api";
import { PoseScoreComparison } from "./PoseScoreComparison";
import type { PoseSet } from "./types";
const value = {
  id: "saved-set",
  outcomes: [
    {
      combination: { step_id: "pose_000", member_index: 0, ligand_index: 0 },
      poses: [
        {
          reference: { asset_id: "exact-pose", version_id: "exact-version" },
          evidence: { record: 0, scores: [] },
        },
      ],
    },
  ],
} as unknown as PoseSet;
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});
it("submits exact native selections and chosen score tradeoffs, then opens the saved pose", async () => {
  vi.spyOn(client, "request").mockResolvedValue([]);
  const post = vi.spyOn(client.api, "post").mockResolvedValue({
    id: "comparison",
    request: {
      pose_set_id: "saved-set",
      selections: [{ step_id: "pose_000", record: 0 }],
      metrics: ["minimizedAffinity", "CNNscore"],
    },
    groups: [
      {
        condition_sha256: "a".repeat(64),
        conditions: {},
        poses: [
          {
            selection: { step_id: "pose_000", record: 0 },
            front: null,
            missing_metrics: ["CNNscore"],
            scores: [],
          },
        ],
      },
    ],
  });
  const selected = vi.fn(),
    user = userEvent.setup();
  render(
    <PoseScoreComparison
      value={value}
      outcomeIndex={0}
      language="en"
      onSelect={selected}
    />,
  );
  await user.click(screen.getByText("Compare native scores", { exact: true }));
  await user.selectOptions(
    screen.getByRole("combobox", { name: "Which score comparison?" }),
    "pose",
  );
  await user.click(
    screen.getByRole("button", { name: "Compare and save evidence" }),
  );
  expect(post).toHaveBeenCalledWith(
    "/research/pose-score-comparisons",
    {
      pose_set_id: "saved-set",
      selections: [{ step_id: "pose_000", record: 0 }],
      metrics: ["minimizedAffinity", "CNNscore"],
    },
    expect.any(String),
  );
  expect(
    await screen.findByText("Missing metrics: CNN pose score"),
  ).toBeVisible();
  const group = screen.getByRole("region", {
    name: "Equal-condition score comparison",
  });
  await user.click(group.querySelector("button")!);
  expect(selected).toHaveBeenCalledWith("pose_000", 0);
});
it("shows API failure and retains an explicit retry instead of synthesizing comparison rows", async () => {
  vi.spyOn(client, "request").mockResolvedValue([]);
  vi.spyOn(client.api, "post").mockRejectedValue(new Error("evidence changed"));
  const user = userEvent.setup();
  render(
    <PoseScoreComparison
      value={value}
      outcomeIndex={0}
      language="en"
      onSelect={vi.fn()}
    />,
  );
  await user.click(screen.getByText("Compare native scores", { exact: true }));
  await user.click(
    screen.getByRole("button", { name: "Compare and save evidence" }),
  );
  expect(await screen.findByRole("alert")).toHaveTextContent(
    "evidence changed",
  );
  expect(
    screen.getByRole("button", { name: "Compare and save evidence" }),
  ).toBeEnabled();
  expect(
    screen.queryByRole("region", { name: "Equal-condition score comparison" }),
  ).not.toBeInTheDocument();
});
