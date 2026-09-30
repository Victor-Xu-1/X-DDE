import { render, screen, fireEvent, within } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import type { ComponentProps } from "react";
import { HomeWorkspace } from "./HomeWorkspace";
import { defaults } from "../form-model";
import { UtilityViews } from "./UtilityViews";
import type { Health } from "../types";
const props: ComponentProps<typeof HomeWorkspace> = {
  active: true,
  resultsVersion: 0,
  language: "zh",
  ready: true,
  health: null,
  connectionError: false,
  onRefresh: vi.fn(),
  jobs: [],
  job: {
    id: "job",
    request: {
      name: "已完成的任务",
      components: [{ kind: "protein", value: "ACDE", count: 1 }],
      parameters: defaults,
    },
    status: "succeeded",
    created_at: "2026-09-30",
    started_at: null,
    finished_at: null,
    error: null,
    parent_id: null,
  },
  detail: null,
  detailError: false,
  onJob: vi.fn(),
  onChanged: vi.fn(),
  projects: [],
  projectId: null,
  onProject: vi.fn(),
  analysis: null,
  loadingAnalysis: false,
  analysisError: "",
  onRetry: vi.fn(),
  onCandidate: vi.fn(),
  urls: [],
  compared: [],
  onCompare: vi.fn(),
  focusResidue: null,
  onResidue: vi.fn(),
  draft: null,
  onReuse: vi.fn(),
  onSubmit: vi.fn(),
};
it("separates task entry from structure review while preserving the draft", () => {
  const { rerender } = render(<HomeWorkspace {...props} />);
  const sequence = screen.getByLabelText("单字母氨基酸序列");
  fireEvent.change(sequence, { target: { value: "ACDE" } });
  fireEvent.click(screen.getByRole("button", { name: "结构与结果" }));
  expect(sequence).not.toBeVisible();
  expect(screen.getByTitle("可交互分子结构")).toBeVisible();
  fireEvent.click(screen.getByRole("button", { name: "新建预测" }));
  expect(sequence).toBeVisible();
  expect(sequence).toHaveValue("ACDE");
  rerender(<HomeWorkspace {...props} resultsVersion={1} />);
  expect(sequence).not.toBeVisible();
  expect(
    screen.getByRole("heading", { name: "已完成的任务 已完成" }),
  ).toBeVisible();
  expect(
    screen.queryByRole("heading", { name: "小分子性质" }),
  ).not.toBeInTheDocument();
});

it("keeps platform and scientific engine readiness independent in the runtime view", () => {
  const health: Health = {
    version: "test",
    engine: { ready: false, gpu: null, reason: "Missing OpenDDE weights" },
    worker_ready: true,
    worker_error: null,
    free_disk_gib: 1,
    disk_total_gib: 2,
    capabilities: {
      prediction: false,
      msa: false,
      templates: false,
      llm: false,
    },
  };
  const runtimeProps = {
    ...props,
    ready: false,
    health,
    view: "models" as const,
    loading: false,
    onHome: vi.fn(),
    onStart: vi.fn(),
    onSetup: vi.fn(),
    onTasks: vi.fn(),
    projectError: "",
    reloadProjects: vi.fn(),
  };
  const { rerender } = render(<UtilityViews {...runtimeProps} />);
  const service = screen.getByRole("heading", {
    name: "X-DDE 平台后端",
  }).parentElement!;
  const backend = screen.getByRole("heading", {
    name: "OpenDDE · 集成环境",
  }).parentElement!;
  expect(within(service).getByText("平台服务就绪")).toBeVisible();
  expect(within(service).queryByRole("alert")).not.toBeInTheDocument();
  expect(within(backend).getByText("环境未就绪")).toBeVisible();
  expect(within(backend).getByRole("alert")).toHaveTextContent(
    "Missing OpenDDE weights",
  );
  rerender(
    <UtilityViews
      {...runtimeProps}
      language="en"
      health={{
        ...health,
        engine: { ...health.engine, ready: true, reason: null },
        worker_ready: false,
        worker_error: "Queue recovery failed",
      }}
    />,
  );
  expect(screen.getByText("Platform service unavailable")).toBeVisible();
  expect(screen.getByText("Environment checks passed")).toBeVisible();
  expect(screen.getByRole("alert")).toHaveTextContent("Queue recovery failed");
});

it("does not render duplicate task results in an inactive prediction workspace", () => {
  const { rerender } = render(
    <HomeWorkspace {...props} active={false} resultsVersion={1} />,
  );
  expect(
    screen.queryByRole("region", { name: "任务详情", hidden: true }),
  ).toBeNull();
  expect(screen.queryByTitle("可交互分子结构")).toBeNull();
  rerender(<HomeWorkspace {...props} active resultsVersion={1} />);
  expect(
    screen.getByRole("region", { name: "任务详情", hidden: true }),
  ).toBeInTheDocument();
});
it("does not send non-prediction tasks to the prediction result workspace", () => {
  render(
    <HomeWorkspace
      {...props}
      resultsVersion={1}
      job={{
        ...props.job!,
        request: {
          operation: "properties",
          name: "property result",
          smiles: ["CCO"],
          ligand_files: [],
        },
      }}
    />,
  );
  expect(
    screen.queryByRole("region", { name: "任务详情", hidden: true }),
  ).toBeNull();
  expect(screen.queryByTitle("可交互分子结构")).toBeNull();
});
