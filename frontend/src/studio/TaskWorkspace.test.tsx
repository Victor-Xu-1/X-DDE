import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { useState, type ComponentProps } from "react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { api } from "../api";
import * as client from "../api";
import { defaults } from "../form-model";
import type { Job } from "../types";
import { TaskWorkspace } from "./TaskWorkspace";
import { historyFixture, identityFixture } from "./task-history.test-fixtures";
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
  window.history.replaceState(null, "", "/");
  historyJobs = [job, descriptors];
  vi.spyOn(client, "request").mockImplementation(async (path) => {
    const identity = path.match(/^\/task-history\/([^/]+)\/identity$/);
    const selected = identity
      ? [job, descriptors, ...historyJobs].find(
          (value) => value.id === identity[1],
        )
      : undefined;
    if (!selected) throw new Error("Unhandled test request: " + path);
    return identityFixture(selected) as never;
  });
  vi.spyOn(api, "taskHistory").mockImplementation(async (path) =>
    historyFixture(historyJobs, path),
  );
});
afterEach(() => {
  vi.restoreAllMocks();
  window.history.replaceState(null, "", "/");
});
function props(
  overrides: Partial<ComponentProps<typeof TaskWorkspace>> = {},
): ComponentProps<typeof TaskWorkspace> {
  return {
    language: "en",
    scopedModule: "evaluation",
    job: null,
    detail: null,
    detailError: false,
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
async function modulePage() {
  await screen.findByRole("button", { name: "STAT6 descriptors" });
}
function openList() {
  const picker = document.querySelector<HTMLDetailsElement>(".task-picker")!;
  picker.open = true;
  fireEvent(picker, new Event("toggle"));
}
it("opens only the owning module and never a mixed task list", async () => {
  const p = props();
  render(<TaskWorkspace {...p} />);
  await modulePage();
  expect(screen.queryByRole("button", { name: "STAT6 structure" })).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "New task" }));
  expect(p.onStart).toHaveBeenCalledWith("admet.predict");
});
it("opens an exact linked task in its owning module and masks foreign selected results", async () => {
  const p = props({ job, scopedModule: "structures" });
  const view = render(<TaskWorkspace key="structures" {...p} />);
  expect(screen.getByText("Actual prediction result")).toBeVisible();
  view.rerender(<TaskWorkspace key="evaluation" {...props({ job })} />);
  await modulePage();
  expect(screen.queryByText("Actual prediction result")).toBeNull();
  expect(
    screen.queryByRole("combobox", { name: "Switch task module" }),
  ).toBeNull();
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
it("keeps a just-submitted task visible when its history request fails", async () => {
  vi.mocked(api.taskHistory).mockRejectedValue(new Error("Unavailable"));
  const p = props({
    scopedModule: "structures",
    job: { ...job, status: "queued" },
  });
  render(<TaskWorkspace {...p} />);
  expect(
    await screen.findByRole("heading", { name: "STAT6 structure" }),
  ).toBeVisible();
  fireEvent.click(await screen.findByRole("button", { name: "Reconnect" }));
  expect(p.onRefresh).toHaveBeenCalledOnce();
});
it("opens other tasks without discarding unclassified history", async () => {
  historyJobs = [
    {
      ...job,
      request: { operation: "doctor", name: "Environment check" },
    } as Job,
  ];
  render(<TaskWorkspace {...props({ scopedModule: "other" })} />);
  await screen.findByRole("button", { name: "Environment check" });
  expect(
    screen.queryByRole("combobox", { name: "Switch task module" }),
  ).toBeNull();
});
it("does not expose a global module picker or foreign results", async () => {
  render(<TaskWorkspace {...props({ job })} />);
  await modulePage();
  expect(screen.queryByRole("button", { name: "Task modules" })).toBeNull();
  expect(screen.queryByRole("group", { name: "Task modules" })).toBeNull();
  expect(screen.queryByText("Actual prediction result")).toBeNull();
});
it("preserves saved Chinese and shows a concise empty workspace", async () => {
  historyJobs = [];
  render(<TaskWorkspace {...props({ language: "zh" })} />);
  await screen.findByText("这个模块还没有任务");
  expect(screen.getByRole("button", { name: "新建任务" })).toBeVisible();
});
it("restores an unselected module and its search after remount instead of opening mixed history", async () => {
  const p = props();
  const first = render(<TaskWorkspace {...p} />);
  await modulePage();
  fireEvent.change(
    screen.getByRole("searchbox", { name: "Search this module" }),
    { target: { value: "STAT6" } },
  );
  await waitFor(() => expect(window.location.hash).toContain("q=STAT6"));
  expect(window.location.hash).toContain("module=evaluation");
  first.unmount();
  render(<TaskWorkspace {...p} />);
  expect(
    screen.queryByRole("combobox", { name: "Switch task module" }),
  ).toBeNull();
  expect(
    screen.getByRole("searchbox", { name: "Search this module" }),
  ).toHaveValue("STAT6");
  await screen.findByRole("button", { name: "STAT6 descriptors" });
  expect(screen.queryByRole("button", { name: "STAT6 structure" })).toBeNull();
});

it.each(["en", "zh"] as const)(
  "persists the visible %s search before the debounced server query",
  async (language) => {
    vi.useFakeTimers();
    const view = render(<TaskWorkspace {...props({ language })} />);
    try {
      await act(async () => vi.advanceTimersByTimeAsync(0));
      fireEvent.change(
        screen.getByRole("searchbox", {
          name: language === "zh" ? "搜索模块内任务" : "Search this module",
        }),
        { target: { value: "STAT6 fragment" } },
      );
      expect(new URLSearchParams(window.location.hash.slice(1)).get("q")).toBe(
        "STAT6 fragment",
      );
      expect(
        vi
          .mocked(api.taskHistory)
          .mock.calls.some(([path]) => path.includes("q=STAT6")),
      ).toBe(false);
      await act(async () => vi.advanceTimersByTimeAsync(250));
      expect(vi.mocked(api.taskHistory).mock.calls.at(-1)?.[0]).toContain(
        "q=STAT6+fragment",
      );
      expect(new URLSearchParams(window.location.hash.slice(1)).get("q")).toBe(
        "STAT6 fragment",
      );
    } finally {
      view.unmount();
      vi.useRealTimers();
    }
  },
);
