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
const base: PreviewPose = {
  urls: [`/api/assets/${id}`],
  source: { kind: "asset", asset_id: id, record: 2 },
  receptor: null,
};
const saved = {
  job_id: "native-task",
  pose: {
    id: "saved-version",
    kind: "molecule",
    reference: {
      asset_id: "saved-file",
      record: 0,
      version_id: "saved-version",
    },
  },
  energy: null,
  native_score: null,
  receptor: null,
} as SavedPose;
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
      <output data-testid="pose-file">{controller.downloadUrl}</output>
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
    render(<Preview available={false} bound={bound} />);
    expect(
      screen.getByRole("button", {
        name: bound ? "Minimize in receptor" : "Minimize energy",
      }),
    ).toBeDisabled();
    await act(() => controller.minimize("MMFF94s", 1000));
    expect(api.post).not.toHaveBeenCalled();
    expect(screen.getByTestId("pose-file")).toHaveTextContent(`${id}?record=2`);
    expect(screen.getByRole("status")).toHaveTextContent(
      "existing poses remain viewable",
    );
  },
);

it("resolves a calculated pose while paused using cache-only admission, without a new native job", async () => {
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
    "saved-file?record=0",
  );
  expect(request).not.toHaveBeenCalled();
});

it.each([false, true])(
  "shows a paused preparation, blocks explicit retry, and recovers after service return (zh=%s)",
  async (zh) => {
    vi.mocked(api.post).mockRejectedValue(
      new Error("Task service is unavailable"),
    );
    const { rerender } = render(<Preview available={false} initial zh={zh} />);
    await act(() => controller.prepareInitial());
    const retry = () =>
      screen.getByRole("button", { name: zh ? "重试" : "Retry" });
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

it("retains saved downloads and undo/redo after the task service pauses", async () => {
  vi.mocked(api.post).mockImplementation(async (path) =>
    path.endsWith("/save") ? saved : { id: saved.job_id },
  );
  vi.mocked(request).mockResolvedValue({
    id: saved.job_id,
    status: "succeeded",
  });
  const { rerender } = render(<Preview available />);
  fireEvent.click(screen.getByRole("button", { name: "Minimize energy" }));
  await waitFor(() => expect(controller.count).toBe(2));
  rerender(<Preview available={false} />);
  expect(
    screen.getByRole("button", { name: "Minimize energy" }),
  ).toBeDisabled();
  expect(
    screen.getByRole("link", { name: "Download current pose" }),
  ).toHaveAttribute("href", "/api/assets/saved-file?record=0");
  fireEvent.click(screen.getByRole("button", { name: "Previous pose" }));
  expect(screen.getByTestId("pose-file")).toHaveTextContent(`${id}?record=2`);
  fireEvent.click(screen.getByRole("button", { name: "Next pose" }));
  expect(screen.getByTestId("pose-file")).toHaveTextContent(
    "saved-file?record=0",
  );
  expect(api.post).toHaveBeenCalledTimes(2);
});

it("keeps cancellation and progress polling available for an already running task", async () => {
  let finish!: (value: unknown) => void;
  vi.mocked(api.post).mockResolvedValue({ id: saved.job_id });
  vi.mocked(request).mockImplementation(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  const { rerender } = render(<Preview available />);
  await act(() => controller.minimize("MMFF94s", 1000));
  rerender(<Preview available={false} />);
  expect(screen.getByRole("button", { name: "Cancel" })).toBeEnabled();
  fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
  await waitFor(() => expect(api.cancel).toHaveBeenCalledWith(saved.job_id));
  await act(async () => finish({ id: saved.job_id, status: "cancelled" }));
  expect(controller.pose.urls).toEqual(base.urls);
});
