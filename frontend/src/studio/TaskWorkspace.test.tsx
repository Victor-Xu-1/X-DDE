import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { useState, type ComponentProps } from "react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { api } from "../api";
import { defaults } from "../form-model";
import type { Job } from "../types";
import { TaskWorkspace } from "./TaskWorkspace";
import { historyFixture } from "./task-history.test-fixtures";
const job: Job = {
  id: "00000000-0000-0000-0000-000000000001",
  request: {
    name: "STAT6 structure",
    components: [{ kind: "protein", value: "ACDE", count: 1 }],
    parameters: defaults,
  },
  status: "succeeded",
  created_at: "2026-10-01",
  started_at: null,
  finished_at: null,
  error: null,
  parent_id: null,
};
const descriptors = {
  ...job,
  id: "00000000-0000-0000-0000-000000000002",
  request: {
    operation: "properties",
    name: "STAT6 descriptors",
    smiles: [],
    ligand_files: [],
  },
  status: "cancelled",
} as Job;
let historyJobs: Job[];
beforeEach(() => {
  historyJobs = [job, descriptors];
  vi.spyOn(api, "taskHistory").mockImplementation(async (path) =>
    historyFixture(historyJobs, path),
  );
});
afterEach(() => vi.restoreAllMocks());
function props(
  overrides: Partial<ComponentProps<typeof TaskWorkspace>> = {},
): ComponentProps<typeof TaskWorkspace> {
  return {
    language: "en",
    job: null,
    detail: null,
    detailError: false,
    connectionError: false,
    onRefresh: vi.fn(),
    onJob: vi.fn(),
    onChanged: vi.fn(),
    onStart: vi.fn(),
    projects: [],
    projectId: null,
    onProject: vi.fn(),
    prediction: <div>Actual prediction result</div>,
    ...overrides,
  };
}
async function modulePage(label = "Properties and safety") {
  await waitFor(() =>
    expect(
      screen.getByRole("group", { name: "Task modules" }),
    ).toHaveTextContent("1 task"),
  );
  fireEvent.click(screen.getByRole("button", { name: new RegExp(label) }));
  await screen.findByRole("button", { name: "STAT6 descriptors" });
}
function openList() {
  const picker = document.querySelector<HTMLDetailsElement>(".task-picker")!;
  picker.open = true;
  fireEvent(picker, new Event("toggle"));
}
it("opens a module overview instead of one mixed task list", async () => {
  const p = props();
  render(<TaskWorkspace {...p} />);
  await modulePage();
  expect(screen.queryByRole("button", { name: "STAT6 structure" })).toBeNull();
  expect(p.onJob).toHaveBeenCalledWith("");
  fireEvent.click(screen.getByRole("button", { name: "New task" }));
  expect(p.onStart).toHaveBeenCalledWith("admet.predict");
});
it("opens a linked task in its exact module and uses the existing prediction preview", async () => {
  render(<TaskWorkspace {...props({ job })} />);
  expect(
    screen.getByRole("heading", { name: "Structure prediction" }),
  ).toBeVisible();
  expect(screen.getByText("Actual prediction result")).toBeVisible();
  expect(
    screen.getByRole("combobox", { name: "Switch task module" }),
  ).toHaveValue("structures");
});
it("clears the prior detail when switching modules", async () => {
  const p = props({ job });
  render(<TaskWorkspace {...p} />);
  fireEvent.change(
    screen.getByRole("combobox", { name: "Switch task module" }),
    { target: { value: "evaluation" } },
  );
  await screen.findByRole("button", { name: "STAT6 descriptors" });
  expect(screen.queryByText("Actual prediction result")).toBeNull();
  expect(p.onJob).toHaveBeenCalledWith("");
});
it("filters within the chosen module and offers a clear empty state", async () => {
  render(<TaskWorkspace {...props()} />);
  await modulePage();
  fireEvent.change(screen.getByRole("combobox", { name: "Status" }), {
    target: { value: "failed" },
  });
  await screen.findByRole("heading", { name: "No matching tasks" });
  expect(
    screen.queryByRole("button", { name: "STAT6 descriptors" }),
  ).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "Clear filters" }));
  await screen.findByRole("button", { name: "STAT6 descriptors" });
});
it("preserves page and query when selecting a row and returning to its list", async () => {
  historyJobs = Array.from({ length: 25 }, (_, i) => ({
    ...descriptors,
    id: `id-${i}`,
    request: { ...descriptors.request, name: `STAT6 series ${i}` },
  }));
  function Harness() {
    const [selected, setSelected] = useState<Job | null>(null);
    return (
      <TaskWorkspace
        {...props({
          job: selected,
          onJob: (id) =>
            setSelected(historyJobs.find((job) => job.id === id) ?? null),
        })}
      />
    );
  }
  render(<Harness />);
  await waitFor(() =>
    expect(
      screen.getByRole("group", { name: "Task modules" }),
    ).toHaveTextContent("25 tasks"),
  );
  fireEvent.click(
    screen.getByRole("button", { name: /Properties and safety/ }),
  );
  await screen.findByRole("button", { name: "STAT6 series 0" });
  fireEvent.change(
    screen.getByRole("searchbox", { name: "Search this module" }),
    { target: { value: "STAT6 series" } },
  );
  await waitFor(() =>
    expect(vi.mocked(api.taskHistory).mock.calls.at(-1)?.[0]).toContain(
      "q=STAT6+series",
    ),
  );
  fireEvent.click(screen.getByRole("button", { name: "Next" }));
  await screen.findByRole("button", { name: "STAT6 series 20" });
  fireEvent.click(screen.getByRole("button", { name: "STAT6 series 20" }));
  openList();
  expect(
    screen.getByRole("searchbox", { name: "Search this module" }),
  ).toHaveValue("STAT6 series");
  expect(
    within(screen.getByRole("navigation", { name: "Task pages" })).getByText(
      "2 / 2",
    ),
  ).toBeVisible();
});
it("keeps projects isolated and hides a selected task belonging to another project", async () => {
  historyJobs = [
    job,
    {
      ...descriptors,
      request: { ...descriptors.request, project_id: "study" },
    },
  ];
  const p = props({
    job,
    projectId: "study",
    projects: [
      {
        id: "study",
        name: "Target study",
        description: "",
        created_at: "2026-10-01",
      },
    ],
  });
  render(<TaskWorkspace {...p} />);
  await modulePage();
  expect(
    screen.getByRole("group", { name: "Project filter" }),
  ).toHaveTextContent("Target study");
  expect(screen.queryByText("Actual prediction result")).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "Clear filter" }));
  expect(p.onProject).toHaveBeenCalledWith(null);
});
it("keeps a just-submitted task visible before history refresh and reports disconnection", () => {
  const p = props({ job: { ...job, status: "queued" }, connectionError: true });
  render(<TaskWorkspace {...p} />);
  expect(
    screen.getByRole("heading", { name: "STAT6 structure" }),
  ).toBeVisible();
  fireEvent.click(screen.getByRole("button", { name: "Reconnect" }));
  expect(p.onRefresh).toHaveBeenCalledOnce();
});
it("opens other tasks without discarding unclassified history", async () => {
  historyJobs = [
    {
      ...job,
      request: { operation: "doctor", name: "Environment check" },
    } as Job,
  ];
  render(<TaskWorkspace {...props()} />);
  await screen.findByRole("button", { name: /Additional tasks/ });
  fireEvent.click(screen.getByRole("button", { name: /Additional tasks/ }));
  await screen.findByRole("button", { name: "Environment check" });
  expect(
    screen.getByRole("combobox", { name: "Switch task module" }),
  ).toHaveValue("other");
});
it("returns to the module overview without showing a mixed task list", async () => {
  render(<TaskWorkspace {...props({ job })} />);
  fireEvent.click(screen.getByRole("button", { name: "Task modules" }));
  expect(screen.getByRole("group", { name: "Task modules" })).toBeVisible();
  expect(document.querySelector(".task-picker")).toBeNull();
  expect(screen.queryByText("Actual prediction result")).toBeNull();
});
it("preserves saved Chinese and shows a concise empty workspace", async () => {
  historyJobs = [];
  render(<TaskWorkspace {...props({ language: "zh" })} />);
  expect(screen.getByRole("group", { name: "任务模块" })).toBeVisible();
  await screen.findByText("还没有研究任务");
  expect(screen.getByRole("button", { name: "新建任务" })).toBeVisible();
});
