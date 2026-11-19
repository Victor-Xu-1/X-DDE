import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { api, request } from "../api";
import { TaskServiceContext } from "../studio/ApplicationScope";
import { InitialPoseStatus } from "./InitialPoseStatus";
import { PoseOptimizationControls } from "./PoseOptimizationControls";
import { usePoseOptimization } from "./usePoseOptimization";
import type { PreviewPose, SavedPose } from "./pose-types";

vi.mock("../api", () => ({
  api: { post: vi.fn(), cancel: vi.fn() },
  request: vi.fn(),
}));
afterEach(() => vi.resetAllMocks());
const id = "00000000-0000-4000-8000-000000000001";
const savedId = "00000000-0000-4000-8000-000000000002";
const savedAsset = "00000000-0000-4000-8000-000000000003";
const nativeJob = "00000000-0000-4000-8000-000000000004";
const base: PreviewPose = {
  urls: [`/api/assets/${id}`],
  source: { kind: "asset", asset_id: id, record: 2 },
  receptor: null,
};
const saved = {
  job_id: nativeJob,
  pose: {
    id: savedId,
    kind: "molecule",
    reference: {
      asset_id: savedAsset,
      record: 0,
      conformer: 0,
      sha256: "a".repeat(64),
      version_id: savedId,
    },
    source_job: nativeJob,
    relation: "edited_from",
  },
  energy: null,
  native_score: null,
  receptor: null,
} as SavedPose;
const runtime = {
  capabilities: {},
  engines: [
    {
      id: "chemistry",
      name: "RDKit",
      ready: true,
      enabled: true,
      active: false,
      operations: ["molecule_minimize"],
    },
  ],
};
let controller: ReturnType<typeof usePoseOptimization>;
function Preview({
  available,
  bound = false,
  initial = false,
  zh = false,
}: {
  available: boolean;
  bound?: boolean;
  initial?: boolean;
  zh?: boolean;
}) {
  return (
    <TaskServiceContext.Provider value={available}>
      <Controls bound={bound} initial={initial} zh={zh} />
    </TaskServiceContext.Provider>
  );
}
function Controls({
  bound,
  initial,
  zh,
}: {
  bound: boolean;
  initial: boolean;
  zh: boolean;
}) {
  controller = usePoseOptimization(
    bound
      ? {
          ...base,
          receptor: { kind: "asset", asset_id: "receptor", record: 0 },
        }
      : base,
    0,
  );
  return (
    <>
      <span data-testid="pose-file">{controller.downloadUrl}</span>
      {initial ? (
        <InitialPoseStatus state={controller} language={zh ? "zh" : "en"} />
      ) : (
        <PoseOptimizationControls
          state={controller}
          language={zh ? "zh" : "en"}
          disabled={false}
        />
      )}
    </>
  );
}

it.each([false, true])(
  "blocks both the minimization control and handler while paused (bound=%s)",
  async (bound) => {
    const engine = bound
      ? { id: "gnina", name: "GNINA", operations: ["docking"] }
      : runtime.engines[0];
    vi.mocked(request).mockResolvedValue({
      ...runtime,
      engines: [{ ready: true, active: false, ...engine, enabled: false }],
    });
    render(<Preview available={false} bound={bound} />);
    expect(
      screen.getByRole("button", {
        name: bound ? "Minimize in receptor" : "Minimize energy",
      }),
    ).toBeDisabled();
    await act(() => controller.minimize("MMFF94s", 1000));
    expect(api.post).not.toHaveBeenCalled();
    expect(
      await screen.findByRole("switch", { name: engine.name }),
    ).not.toBeChecked();
    expect(screen.getByTestId("pose-file")).toHaveTextContent(`${id}?record=2`);
    expect(screen.getByRole("status")).toHaveTextContent(
      "existing poses remain viewable",
    );
  },
);

it("resolves a calculated pose while paused using cache-only admission, without a new native job", async () => {
  vi.mocked(request).mockResolvedValue(runtime);
  vi.mocked(api.post).mockResolvedValue({ state: "ready", pose: saved.pose });
  render(<Preview available={false} />);
  await act(() => controller.prepareInitial());
  expect(api.post).toHaveBeenCalledWith(
    "/research/poses/initial",
    {
      source: base.source,
      method: "MMFF94s",
      retry: false,
      allow_compute: false,
    },
    expect.any(String),
  );
  expect(controller.initialReady).toBe(true);
  expect(screen.getByTestId("pose-file")).toHaveTextContent(
    `${savedAsset}?record=0`,
  );
  expect(
    vi
      .mocked(request)
      .mock.calls.every(([path]) => path.startsWith("/runtime-controls")),
  ).toBe(true);
});

it("offers backend power before the first 3D pose and waits for explicit preparation", async () => {
  let enabled = false;
  vi.mocked(request).mockImplementation(
    async () =>
      ({
        ...runtime,
        engines: [{ ...runtime.engines[0], enabled }],
      }) as never,
  );
  vi.mocked(api.post).mockImplementation(async (path) => {
    if (path === "/runtime-controls/chemistry/start") {
      enabled = true;
      return { enabled };
    }
    return enabled
      ? { state: "ready", pose: saved.pose }
      : { state: "backend_off" };
  });
  render(<Preview available initial />);
  await act(() => controller.prepareInitial());
  const toggle = await screen.findByRole("switch", { name: "RDKit" });
  const prepare = screen.getByRole("button", { name: "Prepare 3D conformer" });
  expect(toggle).not.toBeChecked();
  expect(prepare).toBeDisabled();
  expect(controller.pose.urls).toEqual(base.urls);
  expect(controller.job).toBeNull();
  fireEvent.click(toggle);
  await waitFor(() => expect(prepare).toBeEnabled());
  expect(vi.mocked(api.post).mock.calls.map(([path]) => path)).toEqual([
    "/research/poses/initial",
    "/runtime-controls/chemistry/start",
  ]);
  fireEvent.click(prepare);
  await waitFor(() => expect(controller.initialReady).toBe(true));
  expect(api.post).toHaveBeenLastCalledWith(
    "/research/poses/initial",
    { source: base.source, method: "MMFF94s", retry: true },
    expect.any(String),
  );
});

it.each([false, true])(
  "shows a paused preparation, blocks explicit retry, and recovers after service return (zh=%s)",
  async (zh) => {
    vi.mocked(request).mockResolvedValue(runtime);
    vi.mocked(api.post).mockRejectedValue(
      new Error("Task service is unavailable"),
    );
    const { rerender } = render(<Preview available={false} initial zh={zh} />);
    await act(() => controller.prepareInitial());
    const retry = () =>
      screen.getByRole("button", { name: zh ? "重试" : "Retry" });
    expect(await screen.findByRole("switch", { name: "RDKit" })).toBeChecked();
    expect(retry()).toBeDisabled();
    expect(screen.getByRole("alert")).toHaveTextContent(
      zh ? "计算服务恢复后可重试" : "Retry when the task service recovers",
    );
    await act(() => controller.prepareInitial("UFF", true));
    expect(api.post).toHaveBeenCalledTimes(1);
    expect(controller.initialReady).toBe(false);
    expect(controller.pose.urls).toEqual(base.urls);
    rerender(<Preview available initial zh={zh} />);
    expect(retry()).toBeEnabled();
    vi.mocked(api.post).mockResolvedValue({ state: "ready", pose: saved.pose });
    fireEvent.click(retry());
    await waitFor(() => expect(controller.initialReady).toBe(true));
    expect(vi.mocked(api.post).mock.calls[1][1]).toEqual({
      source: base.source,
      method: "MMFF94s",
      retry: true,
    });
  },
);

it("keeps failed preparation on the same page until its backend and retry are explicitly chosen", async () => {
  let enabled = false;
  vi.mocked(request).mockImplementation(async () => ({
    ...runtime,
    engines: [{ ...runtime.engines[0], enabled }],
  }));
  vi.mocked(api.post).mockImplementation(async (path, body) => {
    if (path === "/runtime-controls/chemistry/start") {
      enabled = true;
      return { enabled };
    }
    if (path === "/runtime-controls/chemistry/stop") {
      enabled = false;
      return { enabled };
    }
    if (
      path === "/research/poses/initial" &&
      enabled &&
      (body as { method: string }).method === "UFF"
    )
      return { state: "ready", pose: saved.pose };
    throw new Error("Initial conformer failed.");
  });
  render(<Preview available initial />);
  await act(() => controller.prepareInitial());
  const toggle = await screen.findByRole("switch", { name: "RDKit" });
  const retry = screen.getByRole("button", { name: "Retry" });
  expect(retry).toBeDisabled();
  fireEvent.click(toggle);
  await waitFor(() => expect(retry).toBeEnabled());
  fireEvent.click(toggle);
  await waitFor(() => expect(retry).toBeDisabled());
  expect(vi.mocked(api.post).mock.calls.map(([path]) => path)).toEqual([
    "/research/poses/initial",
    "/runtime-controls/chemistry/start",
    "/runtime-controls/chemistry/stop",
  ]);
  expect(controller.pose.urls).toEqual(base.urls);
  fireEvent.change(
    screen.getByRole("combobox", { name: "3D preparation force field" }),
    {
      target: { value: "UFF" },
    },
  );
  fireEvent.click(toggle);
  await waitFor(() => expect(retry).toBeEnabled());
  fireEvent.click(retry);
  await waitFor(() => expect(controller.initialReady).toBe(true));
  expect(api.post).toHaveBeenLastCalledWith(
    "/research/poses/initial",
    { source: base.source, method: "UFF", retry: true },
    expect.any(String),
  );
});

it("retains saved downloads and undo/redo after the task service pauses", async () => {
  vi.mocked(api.post).mockImplementation(async (path) =>
    path.endsWith("/save") ? saved : { id: saved.job_id },
  );
  vi.mocked(request).mockImplementation(
    async (path) =>
      (path.startsWith("/runtime-controls")
        ? runtime
        : { id: saved.job_id, status: "succeeded" }) as never,
  );
  const { rerender } = render(<Preview available />);
  fireEvent.click(screen.getByRole("button", { name: "Minimize energy" }));
  await waitFor(() => expect(controller.count).toBe(2));
  rerender(<Preview available={false} />);
  expect(
    screen.getByRole("button", { name: "Minimize energy" }),
  ).toBeDisabled();
  expect(
    screen.getByRole("link", { name: "Download current pose" }),
  ).toHaveAttribute("href", `/api/assets/${savedAsset}?record=0`);
  fireEvent.click(screen.getByRole("button", { name: "Previous pose" }));
  expect(screen.getByTestId("pose-file")).toHaveTextContent(`${id}?record=2`);
  fireEvent.click(screen.getByRole("button", { name: "Next pose" }));
  expect(screen.getByTestId("pose-file")).toHaveTextContent(
    `${savedAsset}?record=0`,
  );
  expect(api.post).toHaveBeenCalledTimes(2);
});

it("keeps cancellation and progress polling available for an already running task", async () => {
  let finish!: (value: unknown) => void;
  vi.mocked(api.post).mockResolvedValue({ id: saved.job_id });
  vi.mocked(request).mockImplementation(async (path) => {
    if (path.startsWith("/runtime-controls")) return runtime as never;
    return new Promise((resolve) => {
      finish = resolve;
    });
  });
  const { rerender } = render(<Preview available />);
  await act(() => controller.minimize("MMFF94s", 1000));
  rerender(<Preview available={false} />);
  expect(screen.getByRole("button", { name: "Cancel" })).toBeEnabled();
  fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
  await waitFor(() => expect(api.cancel).toHaveBeenCalledWith(saved.job_id));
  await act(async () => finish({ id: saved.job_id, status: "cancelled" }));
  expect(controller.pose.urls).toEqual(base.urls);
});
