import { fireEvent, render, screen } from "@testing-library/react";
import type { ComponentProps } from "react";
import { expect, it, vi } from "vitest";
import { defaults } from "../form-model";
import type { Job } from "../types";
import { TaskWorkspace } from "./TaskWorkspace";
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

function props(
  overrides: Partial<ComponentProps<typeof TaskWorkspace>> = {},
): ComponentProps<typeof TaskWorkspace> {
  return {
    language: "zh",
    jobs: [],
    job: null,
    detail: null,
    detailError: false,
    loading: false,
    connectionError: false,
    onRefresh: vi.fn(),
    onJob: vi.fn(),
    onChanged: vi.fn(),
    onStart: vi.fn(),
    projects: [],
    projectId: null,
    onProject: vi.fn(),
    prediction: (
      <div>
        <h2>{overrides.job?.request.name}</h2>Prediction result
      </div>
    ),
    ...overrides,
  };
}
it("offers one research entry rather than separate empty analysis and export pages", () => {
  const p = props();
  render(<TaskWorkspace {...p} />);
  const picker = document.querySelector<HTMLDetailsElement>(".task-picker");
  if (picker && !picker.open) fireEvent.click(picker.querySelector("summary")!);
  fireEvent.click(screen.getByRole("button", { name: "开始研究" }));
  expect(p.onStart).toHaveBeenCalledOnce();
  expect(screen.queryByText("结果解读")).toBeNull();
  expect(screen.queryByText("导出结果")).toBeNull();
});
it("distinguishes loading, disconnected and empty task lists", () => {
  const p = props({ language: "en", loading: true });
  const { rerender } = render(<TaskWorkspace {...p} />);
  expect(screen.getByRole("status")).toHaveTextContent("Loading tasks");
  expect(screen.queryByRole("button", { name: "Start research" })).toBeNull();
  rerender(<TaskWorkspace {...p} loading={false} connectionError />);
  expect(screen.getByRole("alert")).toHaveTextContent("Unable to load tasks");
  expect(screen.queryByText("No research tasks yet")).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "Reconnect" }));
  expect(p.onRefresh).toHaveBeenCalledOnce();
  rerender(<TaskWorkspace {...p} loading={false} />);
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
  render(<TaskWorkspace {...p} />);
  const picker = document.querySelector<HTMLDetailsElement>(".task-picker");
  if (picker && !picker.open) fireEvent.click(picker.querySelector("summary")!);
  expect(screen.getByRole("alert")).toHaveTextContent(
    "Task status may be out of date",
  );
  expect(
    screen.getByRole("button", { name: /Protein structure/ }),
  ).toHaveAttribute("aria-pressed", "true");
  fireEvent.click(screen.getByRole("button", { name: /Other task/ }));
  expect(p.onJob).toHaveBeenCalledWith("other");
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
  render(<TaskWorkspace {...p} />);
  const picker = document.querySelector<HTMLDetailsElement>(".task-picker");
  if (picker && !picker.open) fireEvent.click(picker.querySelector("summary")!);
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
  render(<TaskWorkspace {...p} />);
  const picker = document.querySelector<HTMLDetailsElement>(".task-picker");
  if (picker && !picker.open) fireEvent.click(picker.querySelector("summary")!);
  expect(
    screen.getByRole("heading", { name: "这个项目还没有任务" }),
  ).toBeVisible();
  expect(screen.queryByText("Protein structure")).toBeNull();
  expect(screen.getByRole("button", { name: "清除筛选" })).toBeVisible();
});

it("shows a newly submitted task before it appears in the next task list refresh", () => {
  const p = props({ job: { ...job, status: "queued" } });
  render(<TaskWorkspace {...p} />);
  const picker = document.querySelector<HTMLDetailsElement>(".task-picker");
  if (picker && !picker.open) fireEvent.click(picker.querySelector("summary")!);
  expect(
    screen.getByRole("button", { name: /Protein structure/ }),
  ).toHaveAttribute("aria-pressed", "true");
  expect(
    screen.getByRole("heading", { name: "Protein structure" }),
  ).toBeVisible();
  expect(screen.queryByText("还没有研究任务")).toBeNull();
});

it("uses the shared actual prediction result instead of a second file-only result page", () => {
  const p = props({ job, jobs: [job] });
  render(<TaskWorkspace {...p} />);
  const picker = document.querySelector<HTMLDetailsElement>(".task-picker");
  if (picker && !picker.open) fireEvent.click(picker.querySelector("summary")!);
  expect(screen.getByText("Prediction result")).toBeVisible();
  expect(screen.queryByRole("region", { name: "任务详情" })).toBeNull();
});
