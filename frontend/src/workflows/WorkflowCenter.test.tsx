import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, expect, it, vi } from "vitest";
import { WorkflowCenter } from "./WorkflowCenter";
import { ExampleContext } from "../examples/context";
import type { PreparedExample } from "../examples/types";

const transport = vi.hoisted(() => ({ request: vi.fn(), post: vi.fn() }));
vi.mock("../api", () => ({
  request: transport.request,
  api: { post: transport.post },
}));
const body = {
  name: "Protocol handoff fixture",
  steps: [
    {
      id: "prepare",
      request: {
        operation: "properties" as const,
        name: "Protocol",
        smiles: ["C"],
        ligand_files: [],
      },
      depends_on: [],
      bindings: [],
      retries: 0,
      retry_backoff_seconds: 5,
    },
  ],
  budget: { max_jobs: 1, wall_seconds: 3600 },
};
const example: PreparedExample = {
  module: { capability_id: "workflows", case_id: "brd4-jq1", revision: 1 },
  case: {
    id: "brd4-jq1",
    revision: 1,
    label: ["Protocol", "Protocol"],
    description: ["", ""],
    sources: [],
  },
  objects: {},
  sequences: {},
  sources: [],
  workflow_plan: body,
};

const runtime = {
  engines: [
    {
      id: "chemistry",
      name: "RDKit",
      ready: true,
      enabled: false,
      active: false,
      operations: ["properties"],
    },
    {
      id: "gnina",
      name: "GNINA",
      ready: true,
      enabled: false,
      active: false,
      operations: ["docking"],
    },
  ],
};
beforeEach(() => {
  transport.request.mockReset();
  transport.post.mockReset();
});

it("loads a guided case plan and requires saving and review before running", async () => {
  transport.request.mockImplementation(async (path) =>
    path.startsWith("/runtime-controls") ? runtime : [],
  );
  const saved = { id: "fixed-plan", sha256: "a".repeat(64), body };
  transport.post.mockImplementation(async (path) =>
    path === "/workflows/plans"
      ? saved
      : {
          id: "fixed-run",
          plan_id: saved.id,
          state: "succeeded",
          attempts: [],
        },
  );
  render(
    <ExampleContext.Provider value={example}>
      <WorkflowCenter language="zh" jobs={[]} />
    </ExampleContext.Provider>,
  );
  expect(
    screen.getByRole("combobox", { name: "如何准备研究计划？" }),
  ).toHaveValue("case");
  const power = await screen.findByRole("switch", { name: "RDKit" });
  expect(power).not.toBeChecked();
  expect(transport.post).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "下一步" }));
  expect(screen.getByText("Protocol")).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "下一步" }));
  fireEvent.click(screen.getByRole("button", { name: "下一步" }));
  expect(transport.post).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "保存计划（不执行）" }));
  await waitFor(() => expect(transport.post).toHaveBeenCalledTimes(1));
  expect(transport.post.mock.calls[0][0]).toBe("/workflows/plans");
  expect(transport.post.mock.calls[0][1]).toEqual(body);
  expect(screen.getByRole("switch", { name: "RDKit" })).not.toBeChecked();
  const start = screen.getByRole("button", { name: "运行这个计划" });
  expect(start).toBeEnabled();
  fireEvent.click(start);
  await waitFor(() => expect(transport.post).toHaveBeenCalledTimes(2));
  expect(
    await screen.findByRole("region", { name: "研究计划运行" }),
  ).toBeVisible();
  expect(screen.getByRole("switch", { name: "RDKit" })).toBeVisible();
  expect(screen.getByRole("switch", { name: "RDKit" })).not.toBeChecked();
});

it("looks up the exact plan for a history run outside the plan list, with retry", async () => {
  const run = {
    id: "historic-run",
    plan_id: "older-plan",
    state: "succeeded",
    attempts: [],
  };
  const older = {
    id: run.plan_id,
    sha256: "b".repeat(64),
    body: {
      ...body,
      steps: [
        ...body.steps,
        { request: { operation: "docking" } },
        { request: { operation: "docking" } },
      ],
    },
  };
  let detailReads = 0;
  transport.request.mockImplementation(async (path) => {
    if (path === "/workflows/runs") return [run];
    if (path === "/workflows/plans/older-plan") {
      if (++detailReads === 1) throw new Error("temporary read failure");
      return older;
    }
    return path.startsWith("/runtime-controls") ? runtime : [];
  });
  render(<WorkflowCenter language="en" jobs={[]} />);
  const user = userEvent.setup();
  await user.click(screen.getByText("Run history"));
  await screen.findByRole("option", { name: /Run.*#1/ });
  await user.selectOptions(
    screen.getByRole("combobox", { name: "Open a persisted run" }),
    run.id,
  );
  expect(await screen.findByRole("alert")).toHaveTextContent(
    "Cannot read the backends for this run.",
  );
  expect(screen.queryByRole("switch")).not.toBeInTheDocument();
  await user.click(screen.getByRole("button", { name: "Retry" }));
  expect(
    await screen.findByRole("switch", { name: "RDKit" }),
  ).not.toBeChecked();
  expect(screen.getByRole("switch", { name: "GNINA" })).not.toBeChecked();
  expect(screen.getAllByRole("switch")).toHaveLength(2);
  expect(detailReads).toBe(2);
  expect(transport.post).not.toHaveBeenCalled();
});
