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
import { api } from "./api";
import * as client from "./api";
import * as deployment from "./deployment/client";
import * as i18n from "./i18n";
import {
  historyFixture,
  identityFixture,
} from "./studio/task-history.test-fixtures";
import type { Health, Job, Language } from "./types";

const A = "11111111-1111-4111-8111-111111111111";
const job = (status: Job["status"] = "running"): Job => ({
  id: A,
  status,
  request: {
    operation: "properties",
    name: "Live task",
    smiles: ["CCO"],
    ligand_files: [],
  },
  created_at: "2026-10-12T01:00:00Z",
  started_at: "2026-10-12T01:01:00Z",
  finished_at: status === "failed" ? "2026-10-12T01:02:00Z" : null,
  error: status === "failed" ? "Controlled task failure" : null,
  parent_id: null,
});
const health = { engine: { ready: true }, worker_ready: true } as Health;
let selected: Job, disconnected: boolean;
const advance = (ms = 0) =>
  act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
beforeEach(() => {
  vi.useFakeTimers();
  selected = job();
  disconnected = false;
  window.history.replaceState(null, "", "/#task=" + A);
  vi.spyOn(window, "scrollTo").mockImplementation(() => {});
  vi.spyOn(i18n, "restoreLanguage").mockReturnValue("en");
  vi.spyOn(deployment, "useDeployment").mockReturnValue({
    data: null,
    error: "",
    refresh: vi.fn(),
  });
  vi.spyOn(api, "jobs").mockResolvedValue([job()]);
  vi.spyOn(api, "health").mockResolvedValue(health);
  vi.spyOn(api, "artifacts").mockResolvedValue([]);
  vi.spyOn(api, "projects").mockResolvedValue([]);
  vi.spyOn(api, "taskHistory").mockImplementation(async (path) =>
    historyFixture([selected], path),
  );
  vi.spyOn(client, "request").mockImplementation(async (path) => {
    if (path === `/jobs/${A}`) {
      if (disconnected) throw new Error("Disconnected");
      return selected as never;
    }
    if (path === `/task-history/${A}/identity`)
      return identityFixture(selected) as never;
    throw new Error("Unexpected request " + path);
  });
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

it("shows fresh Failed metadata and task error despite stale Running cache and failed health", async () => {
  render(<App />);
  await advance();
  expect(document.querySelector(".detail-panel .status")).toHaveTextContent(
    "Running",
  );
  selected = job("failed");
  vi.mocked(api.health).mockRejectedValue(new Error("Health failure"));
  await advance(3500);
  expect(document.querySelector(".detail-panel .status")).toHaveTextContent(
    "Failed",
  );
  expect(screen.getByText("Controlled task failure")).toBeVisible();
  await advance(6500); // Health has its own ten-second cadence.
  expect(
    document.querySelector('[data-read-error="health"]'),
  ).toHaveTextContent("Availability is unconfirmed");
  expect(
    screen.queryByText("Unable to load the latest tasks. Please reconnect."),
  ).toBeNull();
  expect(window.location.hash).toContain(A);
});

it("keeps status live while files load, then offers Retry after the real deadline", async () => {
  vi.mocked(api.artifacts).mockImplementation(() => new Promise(() => {}));
  render(<App />);
  await advance();
  expect(screen.getByText("Loading task files…")).toBeVisible();
  expect(document.querySelector(".detail-panel .status")).toHaveTextContent(
    "Running",
  );
  selected = job("failed");
  await advance(2000);
  expect(document.querySelector(".detail-panel .status")).toHaveTextContent(
    "Failed",
  );
  await advance(28000);
  const warning = document.querySelector<HTMLElement>(
    '[data-read-error="artifacts"]',
  )!;
  expect(warning).toHaveTextContent("Task files could not be refreshed");
  expect(api.artifacts).toHaveBeenCalledTimes(1);
  vi.mocked(api.artifacts).mockResolvedValue([{ name: "result.sdf", size: 1 }]);
  fireEvent.click(within(warning).getByRole("button", { name: "Retry" }));
  await advance();
  expect(document.querySelector('[data-read-error="artifacts"]')).toBeNull();
  expect(
    document.querySelector('.task-files a[href*="result.sdf"]'),
  ).toBeVisible();
  expect(document.querySelector(".detail-panel .status")).toHaveTextContent(
    "Failed",
  );
});

it.each(["en", "zh"] as Language[])(
  "labels last-confirmed disconnected status and real recovery in %s",
  async (language) => {
    vi.mocked(i18n.restoreLanguage).mockReturnValue(language);
    render(<App />);
    await advance();
    disconnected = true;
    vi.mocked(api.jobs).mockRejectedValue(new Error("Disconnected"));
    await advance(3500);
    const warning = document.querySelector<HTMLElement>(
      '[data-read-error="status"]',
    )!;
    expect(warning).toHaveTextContent(
      language === "zh" ? "最后确认的状态" : "last confirmed state",
    );
    expect(document.querySelector(".detail-panel .status")).toHaveTextContent(
      language === "zh" ? "运行中" : "Running",
    );
    selected = job("failed");
    disconnected = false;
    vi.mocked(api.jobs).mockResolvedValue([selected]);
    fireEvent.click(
      within(warning).getByRole("button", {
        name: language === "zh" ? "重试" : "Retry",
      }),
    );
    await advance();
    expect(document.querySelector('[data-read-error="status"]')).toBeNull();
    expect(document.querySelector(".detail-panel .status")).toHaveTextContent(
      language === "zh" ? "失败" : "Failed",
    );
  },
);

it.each(["en", "zh"] as Language[])(
  "shows a list-only outage and Retry on the default tools view in %s",
  async (language) => {
    window.history.replaceState(null, "", "/");
    vi.mocked(i18n.restoreLanguage).mockReturnValue(language);
    render(<App />);
    await advance();
    expect(document.querySelector(".notification-dot")).toBeNull();
    vi.mocked(api.jobs).mockRejectedValue(new Error("List unavailable"));
    await advance(3000);
    const warning = document.querySelector<HTMLElement>(
      '[data-read-error="jobs"]',
    )!;
    expect(warning).toBeVisible();
    expect(warning).toHaveTextContent(
      language === "zh"
        ? "最后确认的任务信息"
        : "last confirmed task information",
    );
    expect(document.querySelector('[data-read-error="health"]')).toBeNull();
    expect(document.querySelector(".detail-panel")).toBeNull();
    expect(api.jobs).toHaveBeenCalledTimes(2);
    await advance(10000);
    expect(api.jobs).toHaveBeenCalledTimes(2);
    vi.mocked(api.jobs).mockResolvedValue([job("failed")]);
    fireEvent.click(
      within(warning).getByRole("button", {
        name: language === "zh" ? "重试" : "Retry",
      }),
    );
    await advance();
    expect(document.querySelector('[data-read-error="jobs"]')).toBeNull();
    expect(document.querySelector(".notification-dot")).toBeInTheDocument();
    expect(api.jobs).toHaveBeenCalledTimes(3);
  },
);

it.each(["en", "zh"] as Language[])(
  "shows a jobs-only Tasks warning until successful Retry while history and selected status stay live in %s",
  async (language) => {
    const other: Job = {
      ...job(),
      id: "22222222-2222-4222-8222-222222222222",
      request: { ...job().request, name: "Cached task B" },
    };
    vi.mocked(i18n.restoreLanguage).mockReturnValue(language);
    vi.mocked(api.jobs).mockResolvedValue([job(), other]);
    vi.mocked(api.taskHistory).mockImplementation(async (path) =>
      historyFixture([selected, other], path),
    );
    render(<App />);
    await advance();
    const historyReads = vi.mocked(api.taskHistory).mock.calls.length;
    selected = job("failed");
    vi.mocked(api.jobs).mockRejectedValue(new Error("List-only outage"));
    await advance(13000);
    const warning = document.querySelector<HTMLElement>(
      '[data-read-error="jobs"]',
    )!;
    expect(warning).toBeVisible();
    expect(warning).toHaveTextContent(
      language === "zh"
        ? "最后确认的任务信息"
        : "last confirmed task information",
    );
    expect(document.querySelectorAll("[data-read-error]")).toHaveLength(1);
    expect(
      screen.queryByRole("button", {
        name: language === "zh" ? "重新连接" : "Reconnect",
      }),
    ).toBeNull();
    expect(
      screen.getByRole("button", {
        name: language === "zh" ? "刷新任务" : "Refresh tasks",
      }),
    ).toBeVisible();
    expect(document.querySelector(".detail-panel .status")).toHaveTextContent(
      language === "zh" ? "失败" : "Failed",
    );
    expect(api.jobs).toHaveBeenCalledTimes(2);
    expect(api.health).toHaveBeenCalledTimes(2);
    expect(api.artifacts).toHaveBeenCalledTimes(7);
    expect(api.taskHistory).toHaveBeenCalledTimes(historyReads + 4);
    expect(
      screen.queryByRole("button", { name: /Recovered task B/ }),
    ).toBeNull();

    let resolve!: (jobs: Job[]) => void;
    vi.mocked(api.jobs).mockImplementation(
      () =>
        new Promise<Job[]>((done) => {
          resolve = done;
        }),
    );
    fireEvent.click(
      within(warning).getByRole("button", {
        name: language === "zh" ? "重试" : "Retry",
      }),
    );
    await advance();
    expect(warning).toBeVisible(); // Clicking Retry alone is not recovery.
    expect(api.jobs).toHaveBeenCalledTimes(3);
    await act(async () => {
      resolve([
        selected,
        {
          ...other,
          status: "failed",
          request: { ...other.request, name: "Recovered task B" },
        },
      ]);
    });
    expect(document.querySelector('[data-read-error="jobs"]')).toBeNull();
    expect(
      within(document.querySelector(".top-popover")!).getByRole("button", {
        name: /Recovered task B/,
        hidden: true,
      }),
    ).toBeInTheDocument();
    fireEvent.change(
      screen.getByLabelText(language === "zh" ? "搜索任务" : "Search tasks", {
        selector: "input",
      }),
      {
        target: { value: "Recovered task B" },
      },
    );
    expect(
      within(document.querySelector(".search-results")!).getByRole("button", {
        name: /Recovered task B/,
      }),
    ).toBeInTheDocument();
    expect(document.querySelector(".detail-panel h2")).toHaveTextContent(
      "Live task",
    );
    expect(document.querySelector(".detail-panel .status")).toHaveTextContent(
      language === "zh" ? "失败" : "Failed",
    );
    expect(window.location.hash).toContain(A);
  },
);

it.each(["en", "zh"] as Language[])(
  "keeps the classified-history Reconnect specific to a real history failure in %s",
  async (language) => {
    vi.mocked(i18n.restoreLanguage).mockReturnValue(language);
    render(<App />);
    await advance();
    vi.mocked(api.taskHistory).mockRejectedValue(
      new Error("History-only outage"),
    );
    await advance(3000);
    expect(document.querySelectorAll("[data-read-error]")).toHaveLength(0);
    expect(
      screen.getByRole("button", {
        name: language === "zh" ? "重新连接" : "Reconnect",
      }),
    ).toBeVisible();
    expect(document.querySelector(".detail-panel .status")).toHaveTextContent(
      language === "zh" ? "运行中" : "Running",
    );
  },
);
