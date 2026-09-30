import { fireEvent, render, screen } from "@testing-library/react";
import type { ComponentProps } from "react";
import { expect, it, vi } from "vitest";
import { defaults } from "../form-model";
import type { Analysis, Job } from "../types";
import { UtilityViews } from "./UtilityViews";

const job: Job = {
  id: "00000000-0000-0000-0000-000000000001",
  request: {
    name: "Protein structure",
    components: [{ kind: "protein", value: "ACDE", count: 1 }],
    parameters: defaults,
  },
  status: "succeeded",
  created_at: "2026-09-30",
  started_at: null,
  finished_at: null,
  error: null,
  parent_id: null,
};
const analysis: Analysis = {
  schema_version: 1,
  ligands: [],
  metric_notes: {},
  candidates: [
    {
      id: "sample-0",
      artifact: "structure.cif",
      atom_count: 14,
      chains: ["A"],
      ranking_score: 0.9,
      plddt: 85,
      ptm: null,
      iptm: null,
      has_clash: false,
      rmsd_to_first: 0,
      contacts: [],
    },
  ],
};
function props(
  overrides: Partial<ComponentProps<typeof UtilityViews>> = {},
): ComponentProps<typeof UtilityViews> {
  return {
    view: "tasks",
    language: "zh",
    health: null,
    jobs: [],
    job: null,
    detail: null,
    detailError: false,
    loading: false,
    connectionError: false,
    onRefresh: vi.fn(),
    onJob: vi.fn(),
    onChanged: vi.fn(),
    onHome: vi.fn(),
    onStart: vi.fn(),
    onTasks: vi.fn(),
    projects: [],
    projectError: "",
    projectId: null,
    onProject: vi.fn(),
    reloadProjects: vi.fn(),
    analysis: null,
    loadingAnalysis: false,
    analysisError: "",
    onRetry: vi.fn(),
    onCandidate: vi.fn(),
    ...overrides,
  };
}

it.each(["tasks", "analysis", "reports"] as const)(
  "%s offers a research entry when there are no tasks",
  (view) => {
    const p = props({ view });
    render(<UtilityViews {...p} />);
    fireEvent.click(screen.getByRole("button", { name: "开始研究" }));
    expect(p.onStart).toHaveBeenCalledOnce();
    expect(p.onHome).not.toHaveBeenCalled();
    expect(screen.queryByText("回到三维预览")).not.toBeInTheDocument();
    expect(screen.queryByText("预测构象")).not.toBeInTheDocument();
  },
);

it.each(["analysis", "reports"] as const)(
  "%s offers task selection when existing tasks are available",
  (view) => {
    const p = props({ view, language: "en", jobs: [job] });
    render(<UtilityViews {...p} />);
    fireEvent.click(screen.getByRole("button", { name: "Choose task" }));
    expect(p.onTasks).toHaveBeenCalledOnce();
    fireEvent.click(screen.getByRole("button", { name: "Start new research" }));
    expect(p.onStart).toHaveBeenCalledOnce();
    expect(p.onHome).not.toHaveBeenCalled();
  },
);

it("distinguishes loading, disconnected and empty task lists", () => {
  const p = props({ language: "en", loading: true });
  const { rerender } = render(<UtilityViews {...p} />);
  expect(screen.getByRole("status")).toHaveTextContent("Loading tasks");
  expect(screen.queryByRole("button", { name: "Start research" })).toBeNull();
  rerender(<UtilityViews {...p} loading={false} connectionError />);
  expect(screen.getByRole("alert")).toHaveTextContent("Unable to load tasks");
  expect(screen.queryByText("No research tasks yet")).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "Reconnect" }));
  expect(p.onRefresh).toHaveBeenCalledOnce();
  rerender(<UtilityViews {...p} loading={false} />);
  expect(screen.getByRole("button", { name: "Start research" })).toBeVisible();
});

it("keeps available tasks visible during a connection failure and marks the selection", () => {
  const other = {
    ...job,
    id: "other",
    request: { ...job.request, name: "Other task" },
  };
  const p = props({
    language: "en",
    jobs: [job, other],
    job,
    connectionError: true,
  });
  render(<UtilityViews {...p} />);
  expect(screen.getByRole("alert")).toHaveTextContent(
    "Task status may be out of date",
  );
  expect(
    screen.getByRole("button", { name: /Protein structure/ }),
  ).toHaveAttribute("aria-pressed", "true");
  fireEvent.click(screen.getByRole("button", { name: /Other task/ }));
  expect(p.onJob).toHaveBeenCalledWith("other");
});

it("exposes export loading, retryable analysis failure and successful downloads", () => {
  const p = props({
    view: "reports",
    language: "en",
    job,
    jobs: [job],
    loadingAnalysis: true,
  });
  const { rerender } = render(<UtilityViews {...p} />);
  expect(screen.getByRole("status")).toHaveTextContent(
    "Loading export results",
  );
  expect(screen.queryByRole("link", { name: /conformer table/ })).toBeNull();
  expect(
    screen.getByRole("link", { name: "Download input JSON" }),
  ).toHaveAttribute("href", `/api/jobs/${job.id}/input`);
  rerender(
    <UtilityViews {...p} loadingAnalysis={false} analysisError="HTTP 503" />,
  );
  expect(screen.getByRole("alert")).toHaveTextContent(
    "Unable to load the result report",
  );
  fireEvent.click(screen.getByRole("button", { name: "Reload results" }));
  expect(p.onRetry).toHaveBeenCalledOnce();
  expect(screen.queryByRole("link", { name: /result report/ })).toBeNull();
  rerender(<UtilityViews {...p} loadingAnalysis={false} analysis={analysis} />);
  expect(
    screen.getByRole("link", { name: "Download conformer table (CSV)" }),
  ).toHaveAttribute("href", `/api/jobs/${job.id}/candidates.csv`);
  expect(
    screen.getByRole("link", { name: "Download result report (HTML)" }),
  ).toHaveAttribute("href", `/api/jobs/${job.id}/report`);
  expect(screen.getByText("Original files and task details")).toBeVisible();
  fireEvent.click(screen.getByRole("button", { name: "Back to Task center" }));
  expect(p.onTasks).toHaveBeenCalledOnce();
  expect(p.onHome).not.toHaveBeenCalled();
});

it("allows a missing export summary to be requested again", () => {
  const p = props({ view: "reports", job, jobs: [job] });
  render(<UtilityViews {...p} />);
  expect(screen.getByRole("status")).toHaveTextContent("结果报告尚未准备好");
  fireEvent.click(screen.getByRole("button", { name: "重新加载结果" }));
  expect(p.onRetry).toHaveBeenCalledOnce();
});

it.each(["analysis", "reports"] as const)(
  "%s returns a non-prediction task to Task center",
  (view) => {
    const p = props({
      view,
      job: {
        ...job,
        status: "queued",
        request: {
          operation: "properties",
          name: "Properties",
          smiles: ["CCO"],
          ligand_files: [],
        },
      },
    });
    render(<UtilityViews {...p} />);
    fireEvent.click(screen.getByRole("button", { name: "返回任务中心" }));
    expect(p.onTasks).toHaveBeenCalledOnce();
    expect(p.onHome).not.toHaveBeenCalled();
  },
);

it("starts from Help regardless of the previously selected task", () => {
  const p = props({
    view: "help",
    job: { ...job, request: { operation: "doctor", name: "Diagnostics" } },
  });
  render(<UtilityViews {...p} />);
  fireEvent.click(screen.getByRole("button", { name: "开始使用" }));
  expect(p.onStart).toHaveBeenCalledOnce();
  expect(p.onHome).not.toHaveBeenCalled();
});

it("opens the chosen prediction conformer in the 3D preview", () => {
  const p = props({
    view: "analysis",
    job,
    analysis,
    candidate: analysis.candidates[0],
  });
  render(<UtilityViews {...p} />);
  fireEvent.click(screen.getByRole("button", { name: "构象 1" }));
  expect(p.onCandidate).toHaveBeenCalledWith("sample-0");
  expect(p.onHome).toHaveBeenCalledOnce();
  expect(p.onTasks).not.toHaveBeenCalled();
});

it("opens a project's tasks after choosing the project", () => {
  const p = props({
    view: "projects",
    projects: [
      {
        id: "project-a",
        name: "Target study",
        description: "",
        created_at: "2026-09-30",
      },
    ],
  });
  render(<UtilityViews {...p} />);
  fireEvent.click(screen.getByRole("button", { name: /Target study/ }));
  expect(p.onProject).toHaveBeenCalledWith("project-a");
  expect(p.onTasks).toHaveBeenCalledOnce();
});

it("filters task rows by project and does not show another project's selected detail", () => {
  const projectJob = {
    ...job,
    id: "project-job",
    request: { ...job.request, name: "Project task", project_id: "project-a" },
  };
  const p = props({
    language: "en",
    projectId: "project-a",
    projects: [
      {
        id: "project-a",
        name: "Target study",
        description: "",
        created_at: "2026-09-30",
      },
    ],
    jobs: [job, projectJob],
    job,
  });
  render(<UtilityViews {...p} />);
  expect(
    screen.getByRole("group", { name: "Project filter" }),
  ).toHaveTextContent("Target study");
  expect(screen.getByRole("button", { name: /Project task/ })).toBeVisible();
  expect(screen.queryByText("Protein structure")).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: /Project task/ }));
  expect(p.onJob).toHaveBeenCalledWith("project-job");
  fireEvent.click(screen.getByRole("button", { name: "Clear filter" }));
  expect(p.onProject).toHaveBeenCalledWith(null);
});

it("distinguishes an empty project from an empty workspace", () => {
  const p = props({ projectId: "empty-project", jobs: [job], job });
  render(<UtilityViews {...p} />);
  expect(
    screen.getByRole("heading", { name: "这个项目还没有任务" }),
  ).toBeVisible();
  expect(screen.queryByText("Protein structure")).toBeNull();
  expect(screen.getByRole("button", { name: "清除筛选" })).toBeVisible();
});

it("shows a newly submitted task before it appears in the next task list refresh", () => {
  const p = props({ job: { ...job, status: "queued" } });
  render(<UtilityViews {...p} />);
  expect(
    screen.getByRole("button", { name: /Protein structure/ }),
  ).toHaveAttribute("aria-pressed", "true");
  expect(
    screen.getByRole("heading", { name: "Protein structure" }),
  ).toBeVisible();
  expect(screen.queryByText("还没有研究任务")).toBeNull();
});
