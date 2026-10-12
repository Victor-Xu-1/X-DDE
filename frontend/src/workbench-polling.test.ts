import { afterEach, expect, it, vi } from "vitest";
import { freshestJob, readWithDeadline } from "./workbench-polling";
import type { Job } from "./types";

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});
const job = (status: Job["status"], id = "task-a"): Job => ({
  id,
  status,
  request: {
    operation: "properties",
    name: "Task",
    smiles: ["CCO"],
    ligand_files: [],
  },
  created_at: "2026-10-12T01:00:00Z",
  started_at: null,
  finished_at: null,
  error: null,
  parent_id: null,
});

it("composes a deadline with caller cancellation without losing the abort reason", async () => {
  vi.useFakeTimers();
  const controller = new AbortController();
  let signal!: AbortSignal;
  const read = readWithDeadline((value) => {
    signal = value;
    return new Promise(() => {});
  }, controller.signal);
  const error = new DOMException("Selection changed", "AbortError");
  const rejected = expect(read).rejects.toBe(error);
  controller.abort(error);
  await rejected;
  expect(signal.reason).toBe(error);
  expect(vi.getTimerCount()).toBe(0);
});

it("bounds stalled reads and clears their deadline timer even if transport ignores abort", async () => {
  vi.useFakeTimers();
  const controller = new AbortController();
  let signal!: AbortSignal;
  const read = readWithDeadline((value) => {
    signal = value;
    return new Promise(() => {});
  }, controller.signal);
  const rejected = expect(read).rejects.toMatchObject({ name: "TimeoutError" });
  await vi.advanceTimersByTimeAsync(30000);
  await rejected;
  expect(signal.aborted).toBe(true);
  expect(controller.signal.aborted).toBe(false);
  expect(vi.getTimerCount()).toBe(0);
});

it("cleans up successful reads and never starts an already cancelled read", async () => {
  vi.useFakeTimers();
  const controller = new AbortController(),
    read = vi.fn().mockResolvedValue("value");
  expect(await readWithDeadline(read, controller.signal)).toBe("value");
  expect(vi.getTimerCount()).toBe(0);
  controller.abort();
  await expect(readWithDeadline(read, controller.signal)).rejects.toBe(
    controller.signal.reason,
  );
  expect(read).toHaveBeenCalledTimes(1);
});

it.each(["failed", "succeeded", "cancelled", "interrupted"] as const)(
  "never regresses a confirmed %s task to a later-arriving active snapshot",
  (status) => {
    const terminal = { job: job(status), sequence: 2 };
    expect(freshestJob(terminal, { job: job("running"), sequence: 3 })).toBe(
      terminal,
    );
    expect(freshestJob({ job: job("running"), sequence: 3 }, terminal)).toBe(
      terminal,
    );
  },
);

it("uses request order for equal lifecycle states and preserves distinct task identities", () => {
  const newer = { job: job("running"), sequence: 2 };
  expect(
    freshestJob(newer, {
      job: { ...job("running"), error: "Old metadata" },
      sequence: 1,
    }),
  ).toBe(newer);
  const child = { job: job("queued", "retry-child"), sequence: 3 };
  expect(freshestJob(newer, child)).toBe(child);
  const cancelling = { job: job("cancelling"), sequence: 2 };
  expect(freshestJob(cancelling, { job: job("running"), sequence: 3 })).toBe(
    cancelling,
  );
});

it("uses confirmed completion timestamps before request order without inventing a terminal state", () => {
  const earlier = {
    job: { ...job("failed"), finished_at: "2026-10-12T01:01:00Z" },
    sequence: 9,
  };
  const later = {
    job: { ...job("interrupted"), finished_at: "2026-10-12T01:02:00Z" },
    sequence: 2,
  };
  expect(freshestJob(earlier, later)).toBe(later);
  const queued = { job: job("queued"), sequence: 3 };
  expect(freshestJob(undefined, queued)).toBe(queued);
});
