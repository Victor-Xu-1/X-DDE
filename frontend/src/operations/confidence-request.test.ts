import { afterEach, expect, it, vi } from "vitest";
import { request } from "../api";
import { requestConfidence } from "./confidence-request";

vi.mock("../api", () => ({ request: vi.fn() }));
afterEach(() => {
  vi.useRealTimers();
  vi.mocked(request).mockReset();
});

it("waits briefly for a prior reader while preserving the exact source path", async () => {
  vi.useFakeTimers();
  const value = { metric: "pae" };
  vi.mocked(request)
    .mockRejectedValueOnce({ status: 429 })
    .mockResolvedValueOnce(value);
  const pending = requestConfidence(
    "/jobs/selected/confidence?candidate=third&metric=pae",
    new AbortController().signal,
  );
  await vi.advanceTimersByTimeAsync(499);
  expect(request).toHaveBeenCalledTimes(1);
  await vi.advanceTimersByTimeAsync(1);
  expect(await pending).toBe(value);
  expect(vi.mocked(request).mock.calls.map(([path]) => path)).toEqual([
    "/jobs/selected/confidence?candidate=third&metric=pae",
    "/jobs/selected/confidence?candidate=third&metric=pae",
  ]);
  expect(vi.getTimerCount()).toBe(0);
});

it("cancels the waiting retry when the selected source changes", async () => {
  vi.useFakeTimers();
  vi.mocked(request).mockRejectedValue({ status: 429 });
  const owner = new AbortController();
  const pending = requestConfidence("/old", owner.signal);
  const rejected = expect(pending).rejects.toMatchObject({
    name: "AbortError",
  });
  await vi.advanceTimersByTimeAsync(100);
  owner.abort();
  await rejected;
  await vi.advanceTimersByTimeAsync(30000);
  expect(request).toHaveBeenCalledTimes(1);
  expect(vi.getTimerCount()).toBe(0);
});

it.each([404, 422, 503])(
  "does not retry unavailable or invalid data (%s)",
  async (status) => {
    const error = { status };
    vi.mocked(request).mockRejectedValue(error);
    await expect(
      requestConfidence("/selected", new AbortController().signal),
    ).rejects.toBe(error);
    expect(request).toHaveBeenCalledTimes(1);
  },
);

it("bounds reader backpressure to three requests and releases every timer", async () => {
  vi.useFakeTimers();
  const error = { status: 429 };
  vi.mocked(request).mockRejectedValue(error);
  const pending = requestConfidence("/selected", new AbortController().signal);
  const rejected = expect(pending).rejects.toBe(error);
  await vi.advanceTimersByTimeAsync(1500);
  await rejected;
  expect(request).toHaveBeenCalledTimes(3);
  expect(vi.getTimerCount()).toBe(0);
});

it("aborts a stalled native read at the shared deadline without another request", async () => {
  vi.useFakeTimers();
  vi.mocked(request).mockImplementation(
    (_path, options) =>
      new Promise((_resolve, reject) => {
        const signal = options!.signal as AbortSignal;
        signal.addEventListener("abort", () => reject(signal.reason), {
          once: true,
        });
      }),
  );
  const pending = requestConfidence("/selected", new AbortController().signal);
  const rejected = expect(pending).rejects.toMatchObject({
    name: "TimeoutError",
  });
  await vi.advanceTimersByTimeAsync(30000);
  await rejected;
  expect(request).toHaveBeenCalledTimes(1);
  expect(vi.getTimerCount()).toBe(0);
});
