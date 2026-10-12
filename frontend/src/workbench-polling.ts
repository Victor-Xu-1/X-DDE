import type { Job, Status } from "./types";

// Only workbench reads use this deadline. Mutation and upload budgets are unchanged.
export const WORKBENCH_READ_TIMEOUT = 30000;

export async function readWithDeadline<T>(
  read: (signal: AbortSignal) => Promise<T>,
  parent: AbortSignal,
): Promise<T> {
  const deadline = new AbortController();
  const signal = AbortSignal.any([parent, deadline.signal]);
  signal.throwIfAborted();
  const timer = setTimeout(
    () => deadline.abort(new DOMException("Read timed out", "TimeoutError")),
    WORKBENCH_READ_TIMEOUT,
  );
  let onAbort: () => void = () => {};
  try {
    const aborted = new Promise<never>((_, reject) => {
      onAbort = () => reject(signal.reason);
      signal.addEventListener("abort", onAbort, { once: true });
    });
    // Bound even a transport/body reader that fails to reject on cancellation.
    const value = await Promise.race([read(signal), aborted]);
    signal.throwIfAborted();
    return value;
  } finally {
    clearTimeout(timer);
    signal.removeEventListener("abort", onAbort);
  }
}

export function pollWorkbench<T>(
  signal: AbortSignal,
  interval: number,
  read: (signal: AbortSignal) => Promise<T>,
  publish: (value: T) => void,
  fail: (error: Error) => void,
) {
  let timer: ReturnType<typeof setTimeout>;
  async function poll() {
    try {
      const value = await readWithDeadline(read, signal);
      if (signal.aborted) return;
      publish(value);
    } catch (error) {
      if (!signal.aborted)
        fail(
          error instanceof Error || error instanceof DOMException
            ? error
            : new Error(String(error)),
        );
      return; // This stream waits for Retry; other reads continue independently.
    }
    if (!signal.aborted) timer = setTimeout(poll, interval);
  }
  void poll();
  return () => clearTimeout(timer);
}

export interface JobObservation {
  job: Job;
  sequence: number;
}

const phase: Record<Status, number> = {
  queued: 0,
  running: 1,
  paused: 2,
  cancelling: 2,
  succeeded: 3,
  failed: 3,
  cancelled: 3,
  interrupted: 3,
};

export function freshestJob(
  previous: JobObservation | undefined,
  next: JobObservation,
): JobObservation {
  if (!previous || previous.job.id !== next.job.id) return next;
  // A task ID has a one-way lifecycle; retries always create a different ID.
  // Request start order breaks ties, not response arrival order. The API has no
  // update revision, so an older list response must never undo a terminal state.
  const before = phase[previous.job.status],
    after = phase[next.job.status];
  if (before !== after) return after > before ? next : previous;
  const finishedBefore = Date.parse(previous.job.finished_at ?? ""),
    finishedAfter = Date.parse(next.job.finished_at ?? "");
  if (
    Number.isFinite(finishedBefore) &&
    Number.isFinite(finishedAfter) &&
    finishedBefore !== finishedAfter
  )
    return finishedAfter > finishedBefore ? next : previous;
  return next.sequence > previous.sequence ? next : previous;
}
