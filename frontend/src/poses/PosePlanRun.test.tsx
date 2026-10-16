import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, it, vi } from "vitest";
import * as client from "../api";
import { PosePlanRun } from "./PosePlanRun";
import { defaults } from "./generated";
import type { Exploration, PoseSet } from "./types";
import type { WorkflowRun } from "../workflows/types";

vi.mock("./PoseResults", () => ({
  PoseResults: ({ value }: { value: PoseSet }) => (
    <section aria-label="Saved pose result">{value.id}</section>
  ),
}));
vi.mock("../workflows/RunMonitor", () => ({
  RunMonitor: ({ initial }: { initial: WorkflowRun }) => (
    <output>Monitor {initial.id}</output>
  ),
  workflowStateLabel: (state: string) => state,
}));
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});
const plan = {
  id: "exploration",
  plan_id: "plan",
  plan_sha256: "a".repeat(64),
  created_at: "2026-10-01T00:00:00Z",
  request: {
    name: "Receptor comparison",
    site_set_id: "sites",
    site_ids: [],
    ligands: [],
    options: defaults,
  },
  combinations: [],
} as Exploration;
const run = (id: string): WorkflowRun => ({
  id,
  plan_id: "plan",
  state: "succeeded",
  reason: null,
  created_at: "2026-10-01T00:00:00Z",
  attempts: [],
});
const set = (id: string, runId: string): PoseSet => ({
  id,
  exploration_id: "exploration",
  run_id: runId,
  workflow_state: "succeeded",
  collection_status: "complete",
  qualified_pose_count: 9,
  outcomes: [],
});
function source(ready = true) {
  return vi.spyOn(client, "request").mockImplementation(async (path) => {
    if (path.startsWith("/workflows/runs?"))
      return [run("newer"), run("older")] as never;
    if (path.startsWith("/research/pose-ensembles?"))
      return [
        set("newer-poses", "newer"),
        set("older-poses", "older"),
      ] as never;
    return { availability: { configuration_present: ready } } as never;
  });
}

it("opens an explicitly selected historical plan at its saved result without launching or recapturing", async () => {
  source();
  const post = vi.spyOn(client.api, "post");
  render(<PosePlanRun value={plan} language="en" />);
  expect(
    await screen.findByRole("region", { name: "Saved pose result" }),
  ).toHaveTextContent("newer-poses");
  expect(
    screen.getByText("Run settings and history").closest("details"),
  ).not.toHaveAttribute("open");
  expect(
    screen.queryByRole("button", { name: "Start reviewed pose exploration" }),
  ).not.toBeInTheDocument();
  expect(
    screen.queryByRole("button", {
      name: "Capture all combinations and poses",
    }),
  ).not.toBeInTheDocument();
  expect(post).not.toHaveBeenCalled();
});

it("keeps the visible ensemble paired to the selected run when reviewing run history", async () => {
  source();
  const post = vi.spyOn(client.api, "post");
  const user = userEvent.setup();
  render(<PosePlanRun value={plan} language="en" />);
  await screen.findByRole("region", { name: "Saved pose result" });
  await user.click(screen.getByText("Run settings and history"));
  await user.selectOptions(
    screen.getByRole("combobox", { name: "Existing runs" }),
    "older",
  );
  expect(
    screen.getByRole("region", { name: "Saved pose result" }),
  ).toHaveTextContent("older-poses");
  expect(
    screen.getByRole("region", { name: "Saved pose result" }),
  ).not.toHaveTextContent("newer-poses");
  expect(
    screen.queryByRole("combobox", { name: "Saved pose ensembles" }),
  ).not.toBeInTheDocument();
  expect(post).not.toHaveBeenCalled();
});

it("can read saved results without an installed engine and recovers a failed source read without computation", async () => {
  const request = source(false);
  request.mockRejectedValueOnce(new Error("Temporary source outage"));
  const post = vi.spyOn(client.api, "post");
  const user = userEvent.setup();
  render(<PosePlanRun value={plan} language="en" />);
  expect(await screen.findByRole("alert")).toHaveTextContent(
    "Temporary source outage",
  );
  await user.click(
    screen.getByRole("button", { name: "Retry loading results" }),
  );
  expect(
    await screen.findByRole("region", { name: "Saved pose result" }),
  ).toHaveTextContent("newer-poses");
  expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  await user.click(screen.getByText("Run settings and history"));
  expect(
    screen.getByText(/saved results remain available to inspect and download/),
  ).toBeVisible();
  expect(post).not.toHaveBeenCalled();
});
