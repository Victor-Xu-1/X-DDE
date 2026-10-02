import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { expect, it, vi } from "vitest";
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

it("loads a guided case plan and requires saving and review before running", async () => {
  transport.request.mockResolvedValue([]);
  const saved = { id: "fixed-plan", sha256: "a".repeat(64), body };
  transport.post.mockResolvedValue(saved);
  render(
    <ExampleContext.Provider value={example}>
      <WorkflowCenter language="zh" jobs={[]} />
    </ExampleContext.Provider>,
  );
  expect(
    screen.getByRole("combobox", { name: "如何准备研究计划？" }),
  ).toHaveValue("case");
  fireEvent.click(screen.getByRole("button", { name: "下一步" }));
  expect(screen.getByText("对接输出自动成为性质计算输入")).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "下一步" }));
  fireEvent.click(screen.getByRole("button", { name: "下一步" }));
  expect(transport.post).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "保存计划（不执行）" }));
  await waitFor(() => expect(transport.post).toHaveBeenCalledTimes(1));
  expect(transport.post.mock.calls[0][0]).toBe("/workflows/plans");
  expect(transport.post.mock.calls[0][1]).toEqual(body);
  expect(screen.getByRole("button", { name: "运行这个计划" })).toBeEnabled();
});
