import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { api, ApiError } from "./api";
import * as client from "./api";
import { useWorkbench } from "./useWorkbench";
import type { Artifact, Health, Job } from "./types";

const A = "11111111-1111-4111-8111-111111111111",
  B = "22222222-2222-4222-8222-222222222222";
const job = (id = A, status: Job["status"] = "running"): Job => ({
  id,
  status,
  request: {
    operation: "properties",
    name: id,
    smiles: ["CCO"],
    ligand_files: [],
  },
  created_at: "2026-10-12T01:00:00Z",
  started_at: null,
  finished_at: status === "failed" ? "2026-10-12T01:02:00Z" : null,
  error: status === "failed" ? "Controlled task failure" : null,
  parent_id: null,
});
const health = { engine: { ready: true }, worker_ready: true } as Health;
const flush = () =>
  act(async () => {
    await vi.advanceTimersByTimeAsync(0);
  });
const advance = (ms: number) =>
  act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
function pending<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}
beforeEach(() => {
  vi.useFakeTimers();
  window.history.replaceState(null, "", "/#task=" + A);
  vi.spyOn(api, "jobs").mockResolvedValue([job()]);
  vi.spyOn(api, "health").mockResolvedValue(health);
  vi.spyOn(api, "artifacts").mockResolvedValue([]);
  vi.spyOn(client, "request").mockResolvedValue(job());
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

it("publishes successful list and selected metadata independently of a failed health read", async () => {
  vi.mocked(api.health).mockRejectedValue(new Error("Health unavailable"));
  const { result } = renderHook(useWorkbench);
  await flush();
  expect(result.current.loading).toBe(false);
  expect(result.current.jobs).toEqual([job()]);
  expect(result.current.selectedJob).toEqual(job());
  expect(result.current.jobsError).toBeNull();
  expect(result.current.healthError).toBeInstanceOf(Error);
  expect(result.current.health).toBeNull();
  vi.mocked(api.jobs).mockResolvedValue([job(A, "failed")]);
  vi.mocked(client.request).mockResolvedValue(job(A, "failed"));
  await advance(3000);
  expect(result.current.selectedJob?.status).toBe("failed");
  expect(result.current.jobs[0].status).toBe("failed");
  expect(api.health).toHaveBeenCalledTimes(1); // No repeated failed health requests.
});

it("bounds a stalled health read while continuing list/status polling", async () => {
  vi.mocked(api.health).mockImplementation(() => new Promise(() => {}));
  const { result } = renderHook(useWorkbench);
  await advance(30000);
  expect(result.current.loading).toBe(false);
  expect(result.current.healthError).toMatchObject({ name: "TimeoutError" });
  expect(result.current.selectedJob?.status).toBe("running");
  expect(api.health).toHaveBeenCalledTimes(1);
  expect(api.jobs).toHaveBeenCalledTimes(11);
});

it("publishes and refreshes task status while artifacts stall, then reports a bounded retryable file error", async () => {
  vi.mocked(api.artifacts).mockImplementation(() => new Promise(() => {}));
  const { result } = renderHook(useWorkbench);
  await flush();
  expect(result.current.selectedJob?.status).toBe("running");
  expect(result.current.selectedJobLoading).toBe(false);
  expect(result.current.artifactsLoading).toBe(true);
  vi.mocked(client.request).mockResolvedValue(job(A, "failed"));
  await advance(2000);
  expect(result.current.selectedJob?.status).toBe("failed");
  await advance(33000);
  expect(result.current.artifactError).toMatchObject({ name: "TimeoutError" });
  expect(result.current.selectedJobError).toBeNull();
  expect(result.current.detailError).toBe(true);
  expect(api.artifacts).toHaveBeenCalledTimes(1);
  expect(vi.mocked(api.artifacts).mock.calls[0][1]?.aborted).toBe(true);
  expect(client.request).toHaveBeenCalledTimes(18);
  const retried = pending<Artifact[]>();
  vi.mocked(api.artifacts).mockReturnValue(retried.promise);
  act(() => result.current.refresh());
  await flush();
  expect(result.current.artifactError).not.toBeNull(); // Retry is not proof of recovery.
  retried.resolve([{ name: "result.sdf", size: 3 }]);
  await flush();
  expect(result.current.artifactError).toBeNull();
  expect(result.current.detail?.artifacts).toHaveLength(1);
  expect(result.current.selectedJob?.status).toBe("failed");
});

it("times out selected metadata without blocking files/list updates and preserves HTTP errors on retry", async () => {
  vi.mocked(client.request).mockImplementation(() => new Promise(() => {}));
  const { result } = renderHook(useWorkbench);
  await advance(30000);
  expect(result.current.selectedJobError).toMatchObject({
    name: "TimeoutError",
  });
  expect(result.current.detail?.id).toBe(A);
  expect(result.current.artifactError).toBeNull();
  expect(client.request).toHaveBeenCalledTimes(1);
  vi.mocked(client.request).mockRejectedValue(
    new ApiError(404, "Missing task"),
  );
  act(() => result.current.refresh());
  await flush();
  expect(result.current.selectedJobError).toBeInstanceOf(ApiError);
  expect(result.current.selectedJobError).toMatchObject({ status: 404 });
});

it("does not let delayed or newer stale list responses undo a terminal detail or confirmed action", async () => {
  const delayed = pending<Job[]>();
  vi.mocked(api.jobs).mockReturnValueOnce(delayed.promise);
  vi.mocked(client.request).mockResolvedValue(job(A, "failed"));
  const { result } = renderHook(useWorkbench);
  await flush();
  expect(result.current.selectedJob?.status).toBe("failed");
  delayed.resolve([job()]);
  await flush();
  expect(result.current.jobs[0].status).toBe("failed");
  vi.mocked(client.request).mockResolvedValue(job());
  act(() => result.current.refresh());
  await flush();
  expect(result.current.selectedJob?.status).toBe("failed");
  expect(result.current.jobs[0].status).toBe("failed");
  act(() => {
    result.current.confirmJob(job(B, "cancelling"));
    result.current.select(B);
  });
  vi.mocked(client.request).mockResolvedValue(job(B));
  act(() => result.current.refresh());
  await flush();
  expect(result.current.selectedJob?.id).toBe(B);
  expect(result.current.selectedJob?.status).toBe("cancelling");
});

it("accepts a fresher terminal list snapshot even while selected metadata returns Running", async () => {
  const { result } = renderHook(useWorkbench);
  await flush();
  vi.mocked(api.jobs).mockResolvedValue([job(A, "failed")]);
  await advance(6000);
  expect(result.current.selectedJob?.status).toBe("failed");
  expect(result.current.jobs[0].status).toBe("failed");
});

it("uses request-start order for equal-state metadata rather than arrival order", async () => {
  const list = pending<Job[]>();
  vi.mocked(api.jobs).mockReturnValueOnce(list.promise);
  vi.mocked(client.request).mockResolvedValue({
    ...job(),
    request: { ...job().request, name: "New name" },
  });
  const { result } = renderHook(useWorkbench);
  await flush();
  list.resolve([job()]);
  await flush();
  expect(result.current.selectedJob?.request.name).toBe("New name");
  expect(result.current.jobs[0].request.name).toBe("New name");
});

it("aborts old reads on selection, rejects late data, and cleans up every poll on unmount", async () => {
  const status = pending<Job>(),
    files = pending<Artifact[]>();
  vi.mocked(client.request).mockReturnValueOnce(status.promise);
  vi.mocked(api.artifacts).mockReturnValueOnce(files.promise);
  const { result, unmount } = renderHook(useWorkbench);
  await flush();
  const statusSignal = vi.mocked(client.request).mock.calls[0][1]?.signal;
  const fileSignal = vi.mocked(api.artifacts).mock.calls[0][1];
  vi.mocked(client.request).mockResolvedValue(job(B));
  act(() => result.current.select(B));
  await flush();
  expect(statusSignal?.aborted).toBe(true);
  expect(fileSignal?.aborted).toBe(true);
  expect(result.current.selectedJob?.id).toBe(B);
  status.resolve(job(A, "failed"));
  files.resolve([{ name: "old.sdf", size: 1 }]);
  await flush();
  expect(result.current.selectedJob?.id).toBe(B);
  expect(result.current.detail).toEqual({ id: B, artifacts: [] });
  expect(result.current.detailError).toBe(false);
  act(() => result.current.select(""));
  await flush();
  expect(result.current.selectedJob).toBeNull();
  expect(result.current.detail).toBeNull();
  expect(result.current.selectedJobLoading).toBe(false);
  unmount();
  await vi.advanceTimersByTimeAsync(0);
  expect(vi.getTimerCount()).toBe(0);
});

it("keeps the new selection healthy past the cancelled old reads' deadlines", async () => {
  vi.mocked(client.request).mockReturnValueOnce(pending<Job>().promise);
  vi.mocked(api.artifacts).mockReturnValueOnce(pending<Artifact[]>().promise);
  const { result } = renderHook(useWorkbench);
  await flush();
  const oldStatusSignal = vi.mocked(client.request).mock.calls[0][1]?.signal;
  const oldFileSignal = vi.mocked(api.artifacts).mock.calls[0][1];
  vi.mocked(client.request).mockResolvedValue(job(B, "failed"));
  act(() => result.current.select(B));
  await flush();
  expect(oldStatusSignal?.aborted).toBe(true);
  expect(oldFileSignal?.aborted).toBe(true);
  await advance(35000);
  expect(result.current.selectedJob).toEqual(job(B, "failed"));
  expect(result.current.detail).toEqual({ id: B, artifacts: [] });
  expect(result.current.selectedJobError).toBeNull();
  expect(result.current.artifactError).toBeNull();
  expect(client.request).toHaveBeenCalledTimes(19);
  expect(api.artifacts).toHaveBeenCalledTimes(19);
});

it("keeps the last confirmed snapshot and files visible after disconnection until a real retry succeeds", async () => {
  vi.mocked(api.artifacts).mockResolvedValue([{ name: "result.sdf", size: 1 }]);
  const { result } = renderHook(useWorkbench);
  await flush();
  vi.mocked(api.jobs).mockRejectedValue(new Error("Offline"));
  vi.mocked(client.request).mockRejectedValue(new Error("Offline"));
  vi.mocked(api.artifacts).mockRejectedValue(new Error("Offline"));
  await advance(6000);
  expect(result.current.jobsError).not.toBeNull();
  expect(result.current.selectedJobError).not.toBeNull();
  expect(result.current.artifactError).not.toBeNull();
  expect(result.current.selectedJob?.status).toBe("running");
  expect(result.current.detail?.artifacts).toHaveLength(1);
  expect(client.request).toHaveBeenCalledTimes(2);
  vi.mocked(api.jobs).mockResolvedValue([job(A, "failed")]);
  vi.mocked(client.request).mockResolvedValue(job(A, "failed"));
  vi.mocked(api.artifacts).mockResolvedValue([]);
  act(() => result.current.refresh());
  await flush();
  expect(result.current.jobsError).toBeNull();
  expect(result.current.detailError).toBe(false);
  expect(result.current.selectedJob?.status).toBe("failed");
});

it("one Retry restarts all failed streams and repeated Retry never leaves duplicate polling loops", async () => {
  const unavailable = new Error("Offline");
  vi.mocked(api.jobs).mockRejectedValue(unavailable);
  vi.mocked(api.health).mockRejectedValue(unavailable);
  vi.mocked(client.request).mockRejectedValue(unavailable);
  vi.mocked(api.artifacts).mockRejectedValue(unavailable);
  const { result } = renderHook(useWorkbench);
  await advance(90000);
  expect(api.jobs).toHaveBeenCalledTimes(1);
  expect(api.health).toHaveBeenCalledTimes(1);
  expect(client.request).toHaveBeenCalledTimes(1);
  expect(api.artifacts).toHaveBeenCalledTimes(1);
  const held = pending<Artifact[]>();
  vi.mocked(api.jobs).mockResolvedValue([job()]);
  vi.mocked(api.health).mockResolvedValue(health);
  vi.mocked(client.request).mockResolvedValue(job());
  vi.mocked(api.artifacts)
    .mockReturnValueOnce(held.promise)
    .mockResolvedValue([]);
  act(() => result.current.refresh());
  await flush();
  const oldFileSignal = vi.mocked(api.artifacts).mock.calls[1][1];
  act(() => result.current.refresh());
  await flush();
  expect(oldFileSignal?.aborted).toBe(true);
  held.resolve([{ name: "abandoned.sdf", size: 1 }]);
  await flush();
  expect(result.current.connectionError).toBe(false);
  expect(result.current.detailError).toBe(false);
  expect(result.current.detail?.artifacts).toEqual([]);
  vi.mocked(api.jobs).mockClear();
  vi.mocked(api.health).mockClear();
  vi.mocked(client.request).mockClear();
  vi.mocked(api.artifacts).mockClear();
  await advance(6000);
  expect(api.jobs).toHaveBeenCalledTimes(2);
  expect(api.health).toHaveBeenCalledTimes(2);
  expect(client.request).toHaveBeenCalledTimes(3);
  expect(api.artifacts).toHaveBeenCalledTimes(3);
});

it("rejects selected metadata for a different task ID instead of attaching it to the current selection", async () => {
  vi.mocked(client.request).mockResolvedValue(job(B, "failed"));
  const { result } = renderHook(useWorkbench);
  await flush();
  expect(result.current.selectedJob?.id).toBe(A);
  expect(result.current.selectedJob?.status).toBe("running");
  expect(result.current.selectedJobError?.message).toBe(
    "Task response does not match selection",
  );
  expect(result.current.jobs.map((item) => item.id)).toEqual([A]);
});
