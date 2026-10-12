import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { App } from "./App";
import { api, ApiError } from "./api";
import * as client from "./api";
import * as deployment from "./deployment/client";
import * as i18n from "./i18n";
import * as workbench from "./useWorkbench";
import { defaults } from "./form-model";
import {
  historyFixture,
  identityFixture,
} from "./studio/task-history.test-fixtures";
import type { Health, Job, Language } from "./types";

const A = "11111111-1111-4111-8111-111111111111";
const B = "22222222-2222-4222-8222-222222222222";
const job = (id = A): Job => ({
  id,
  status: "running",
  request: {
    operation: "properties",
    name: `Selected task ${id === A ? "A" : "B"}`,
    smiles: ["CCO"],
    ligand_files: [],
  },
  created_at: "2026-10-12T01:00:00Z",
  started_at: "2026-10-12T01:01:00Z",
  finished_at: null,
  error: null,
  parent_id: null,
});
const advance = (ms = 0) =>
  act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
function navigate(hash: string) {
  window.history.pushState(null, "", hash);
  window.dispatchEvent(new PopStateEvent("popstate"));
}
beforeEach(() => {
  vi.useFakeTimers();
  window.history.replaceState(null, "", "/#task=" + A);
  vi.spyOn(window, "scrollTo").mockImplementation(() => {});
  vi.spyOn(i18n, "restoreLanguage").mockReturnValue("en");
  vi.spyOn(deployment, "useDeployment").mockReturnValue({
    data: null,
    error: "",
    refresh: vi.fn(),
  });
  vi.spyOn(api, "jobs").mockResolvedValue([]);
  vi.spyOn(api, "health").mockResolvedValue({
    engine: { ready: true },
    worker_ready: true,
  } as Health);
  vi.spyOn(api, "artifacts").mockResolvedValue([]);
  vi.spyOn(api, "projects").mockResolvedValue([]);
  vi.spyOn(api, "taskHistory").mockImplementation(async (path) =>
    historyFixture([job(B)], path),
  );
  vi.spyOn(client, "request").mockImplementation(async (path) => {
    if (path === `/jobs/${A}`) throw new ApiError(404, "Task not found");
    if (path === `/jobs/${B}`) return job(B) as never;
    const identity = path.match(/^\/task-history\/([^/]+)\/identity$/);
    if (identity) return identityFixture(job(identity[1])) as never;
    throw new Error("Unexpected request " + path);
  });
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

it.each(["en", "zh"] as Language[])(
  "explains a fresh missing deep link in %s instead of silently showing the overview",
  async (language) => {
    vi.mocked(i18n.restoreLanguage).mockReturnValue(language);
    render(<App />);
    await advance();
    expect(
      screen.getByRole("heading", {
        name: language === "zh" ? "任务不可用" : "Task unavailable",
      }),
    ).toBeVisible();
    expect(
      screen.getByRole("link", {
        name: language === "zh" ? "返回任务历史" : "Back to task history",
      }),
    ).toHaveAttribute("href", "#view=results&module=other");
    expect(screen.queryByRole("group", { name: "Task modules" })).toBeNull();
    expect(window.location.hash).toContain(A);
    expect(document.querySelectorAll("[data-read-error]")).toHaveLength(0);
    expect(document.querySelector(".detail-panel")).toBeNull();
  },
);

it("shows a pending task before metadata arrives and retains the requested URL", async () => {
  vi.mocked(client.request).mockImplementation(() => new Promise(() => {}));
  render(<App />);
  expect(
    screen.getByRole("heading", { name: "Loading selected task…" }),
  ).toBeVisible();
  await advance(30000);
  expect(
    screen.getByRole("heading", { name: "Unable to load task" }),
  ).toBeVisible();
  expect(screen.getByRole("button", { name: "Retry" })).toBeVisible();
  expect(window.location.hash).toContain(A);
  expect(window.location.hash).toBe("#task=" + A);
});

it("waits for a task's owner before canonicalizing a same-page legacy link", async () => {
  window.history.replaceState(null, "", "/#task=");
  let resolve!: (value: Job) => void;
  vi.mocked(client.request).mockImplementation(async (path) => {
    if (path === `/jobs/${B}`)
      return new Promise<Job>((done) => {
        resolve = done;
      }) as never;
    if (path.startsWith("/task-history/"))
      return identityFixture(job(B)) as never;
    throw new Error("Unrelated request " + path);
  });
  render(<App />);
  await advance();
  act(() => navigate("#task=" + B));
  await advance();
  expect(
    screen.getByRole("heading", { name: "Loading selected task…" }),
  ).toBeVisible();
  expect(window.location.hash).toBe("#task=" + B);
  await act(async () => {
    resolve(job(B));
  });
  expect(document.querySelector(".page-context-title")).toHaveTextContent(
    "Properties and safety",
  );
  expect(document.querySelector(".detail-panel h2")).toHaveTextContent(
    "Selected task B",
  );
  expect(window.location.hash).toBe(
    "#view=results&module=evaluation&task=" + B,
  );
});

it.each(["same-module", "different-module"])(
  "does not resolve a new %s legacy address from the preceding task's metadata",
  async (mode) => {
    const first = job(A);
    const second: Job =
      mode === "same-module"
        ? job(B)
        : {
            ...job(B),
            request: {
              name: "Protein task B",
              components: [
                { kind: "protein", value: "ACDEFGHIKLMNPQRSTVWY", count: 1 },
              ],
              parameters: defaults,
            },
          };
    const read = (current: Job): ReturnType<typeof workbench.useWorkbench> => ({
      jobs: [first, second],
      selected: current.id,
      selectedJob: current,
      health: null,
      detail: { id: current.id, artifacts: [] },
      select: vi.fn(),
      confirmJob: vi.fn(),
      refresh: vi.fn(),
      jobsError: null,
      healthError: null,
      selectedJobError: null,
      selectedJobLoading: false,
      artifactError: null,
      artifactsLoading: false,
      connectionError: false,
      detailError: false,
      loading: false,
    });
    const reader = vi
      .spyOn(workbench, "useWorkbench")
      .mockReturnValue(read(first));
    const view = render(<App />);
    await advance();
    expect(window.location.hash).toContain("module=evaluation");
    act(() => navigate("#task=" + B));
    await advance();
    expect(window.location.hash).toBe("#task=" + B);
    reader.mockReturnValue(read(second));
    view.rerender(<App />);
    await advance();
    expect(document.querySelector(".page-context-title")).toHaveTextContent(
      mode === "same-module" ? "Properties and safety" : "Structure prediction",
    );
    expect(window.location.hash).toBe(
      "#view=results&module=" +
        (mode === "same-module" ? "evaluation" : "structures") +
        "&task=" +
        B,
    );
  },
);

it.each([
  new Error("Network unavailable"),
  new ApiError(503, "Service unavailable"),
])(
  "retries a read failure without creating a new task and waits for successful metadata: %s",
  async (error) => {
    vi.mocked(client.request).mockRejectedValue(error);
    const submit = vi.spyOn(api, "submit"),
      retry = vi.spyOn(api, "retry");
    render(<App />);
    await advance();
    const warning = screen.getByRole("alert");
    expect(warning).toHaveTextContent("Unable to load task");
    expect(
      screen.queryByRole("heading", { name: "Task unavailable" }),
    ).toBeNull();
    let resolve!: (value: Job) => void;
    vi.mocked(client.request).mockImplementation(async (path) => {
      if (path === `/jobs/${A}`)
        return new Promise<Job>((done) => {
          resolve = done;
        }) as never;
      return identityFixture(job()) as never;
    });
    fireEvent.click(within(warning).getByRole("button", { name: "Retry" }));
    await advance();
    expect(warning).toBeVisible();
    expect(
      within(warning).getByRole("button", { name: "Retry" }),
    ).toBeDisabled();
    await act(async () => {
      resolve(job());
    });
    expect(
      screen.queryByRole("heading", { name: "Unable to load task" }),
    ).toBeNull();
    expect(document.querySelector(".detail-panel h2")).toHaveTextContent(
      "Selected task A",
    );
    expect(window.location.hash).toContain(A);
    expect(submit).not.toHaveBeenCalled();
    expect(retry).not.toHaveBeenCalled();
  },
);

it("keeps history filters in the recovery link and after selection is cleared", async () => {
  const route =
    "#view=results&module=evaluation&type=properties&status=running&q=Selected";
  window.history.replaceState(null, "", route + "&task=" + A);
  render(<App />);
  await advance();
  const back = screen.getByRole("link", { name: "Back to task history" });
  expect(back).toHaveAttribute("href", route);
  act(() => navigate(back.getAttribute("href")!));
  await advance();
  expect(
    screen.queryByRole("heading", { name: "Task unavailable" }),
  ).toBeNull();
  expect(
    screen.getByRole("searchbox", { name: "Search this module" }),
  ).toHaveValue("Selected");
  expect(screen.getByRole("combobox", { name: "Status" })).toHaveValue(
    "running",
  );
  expect(window.location.hash).toBe(route);
  expect(screen.getByRole("button", { name: "Selected task B" })).toBeVisible();
});

it("discards a delayed A failure after a newer B navigation", async () => {
  let rejectA!: (error: Error) => void;
  vi.mocked(client.request).mockImplementation(async (path) => {
    if (path === `/jobs/${A}`)
      return new Promise((_, reject) => {
        rejectA = reject;
      });
    if (path === `/jobs/${B}`) return job(B) as never;
    return identityFixture(job(B)) as never;
  });
  render(<App />);
  await advance();
  act(() => navigate("#task=" + B));
  await advance();
  await act(async () => {
    rejectA(new ApiError(404, "Late missing task"));
  });
  expect(document.querySelector(".detail-panel h2")).toHaveTextContent(
    "Selected task B",
  );
  expect(
    screen.queryByRole("heading", { name: "Task unavailable" }),
  ).toBeNull();
  expect(window.location.hash).toContain(B);
});

it("loads an existing deep-linked task even when it is absent from the list", async () => {
  vi.mocked(client.request).mockImplementation(
    async (path) =>
      (path === `/jobs/${A}` ? job() : identityFixture(job())) as never,
  );
  render(<App />);
  await advance();
  expect(document.querySelector(".detail-panel h2")).toHaveTextContent(
    "Selected task A",
  );
  expect(document.querySelector(".detail-panel .status")).toHaveTextContent(
    "Running",
  );
  expect(
    screen.queryByRole("link", { name: "Back to task history" }),
  ).toBeNull();
});

it("discards a delayed A success after leaving its loading view for B", async () => {
  let resolveA!: (value: Job) => void;
  vi.mocked(client.request).mockImplementation(async (path) => {
    if (path === `/jobs/${A}`)
      return new Promise<Job>((resolve) => {
        resolveA = resolve;
      }) as never;
    if (path === `/jobs/${B}`) return job(B) as never;
    return identityFixture(job(B)) as never;
  });
  render(<App />);
  await advance();
  act(() => navigate("#task=" + B));
  await advance();
  await act(async () => {
    resolveA(job());
  });
  expect(document.querySelector(".detail-panel h2")).toHaveTextContent(
    "Selected task B",
  );
  expect(window.location.hash).toContain(B);
});

it("keeps project and a valid history page in the missing-task recovery route", async () => {
  const project = "33333333-3333-4333-8333-333333333333";
  const route =
    "#view=results&module=evaluation&type=properties&status=running&q=Selected&page=1&project=" +
    project;
  window.history.replaceState(null, "", route + "&task=" + A);
  vi.mocked(api.taskHistory).mockImplementation(async (path) => ({
    ...historyFixture([job(B)], path),
    total: 40,
    offset: 20,
  }));
  render(<App />);
  await advance();
  expect(
    screen.getByRole("link", { name: "Back to task history" }),
  ).toHaveAttribute("href", route);
  expect(window.location.hash).toBe(route + "&task=" + A);
});
