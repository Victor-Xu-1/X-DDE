import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import * as client from "../api";
import { useTaskReadiness } from "./useTaskReadiness";

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.restoreAllMocks();
});
function pending() {
  let resolve!: (value: unknown) => void;
  const promise = new Promise((complete) => {
    resolve = complete;
  });
  return { promise, resolve };
}
it.each([true, false])(
  "keeps checking separate from the resolved availability %s",
  async (ready) => {
    const response = pending();
    const request = vi
      .spyOn(client, "request")
      .mockReturnValue(response.promise);
    const { result, rerender } = renderHook(() =>
      useTaskReadiness("properties"),
    );
    expect(result.current.ready).toBeUndefined();
    expect(result.current.error).toBe("");
    await act(async () =>
      response.resolve({ availability: { configuration_present: ready } }),
    );
    expect(result.current.ready).toBe(ready);
    rerender();
    expect(request).toHaveBeenCalledOnce();
  },
);
it("clears old method readiness and ignores its response after a method switch", async () => {
  const first = pending(),
    second = pending();
  const request = vi
    .spyOn(client, "request")
    .mockReturnValueOnce(first.promise)
    .mockReturnValueOnce(second.promise);
  const { result, rerender } = renderHook(({ id }) => useTaskReadiness(id), {
    initialProps: { id: "properties" },
  });
  rerender({ id: "admet.predict" });
  expect((request.mock.calls[0][1]!.signal as AbortSignal).aborted).toBe(true);
  await act(async () =>
    first.resolve({ availability: { configuration_present: true } }),
  );
  expect(result.current.ready).toBeUndefined();
  await act(async () =>
    second.resolve({ availability: { configuration_present: false } }),
  );
  expect(result.current.ready).toBe(false);
});
it.each([
  {},
  { availability: {} },
  { availability: { configuration_present: "true" } },
])(
  "blocks malformed availability without treating it as configured",
  async (value) => {
    vi.spyOn(client, "request").mockResolvedValue(value);
    const { result } = renderHook(() => useTaskReadiness("properties"));
    await waitFor(() => expect(result.current.error).not.toBe(""));
    expect(result.current.ready).toBe(false);
  },
);
it("aborts an in-flight check when its form unmounts", async () => {
  const response = pending();
  const request = vi.spyOn(client, "request").mockReturnValue(response.promise);
  const { unmount } = renderHook(() => useTaskReadiness("properties"));
  const signal = request.mock.calls[0][1]!.signal as AbortSignal;
  unmount();
  expect(signal.aborted).toBe(true);
  await act(async () =>
    response.resolve({ availability: { configuration_present: true } }),
  );
});

it("rejects a response that arrives after the bounded readiness deadline", async () => {
  vi.useFakeTimers();
  const response = pending();
  vi.spyOn(client, "request").mockReturnValue(response.promise);
  const { result } = renderHook(() => useTaskReadiness("properties"));
  await act(async () => {
    vi.advanceTimersByTime(15000);
    response.resolve({ availability: { configuration_present: true } });
  });
  expect(result.current.ready).toBe(false);
  expect(result.current.error).toBe(
    "The calculation environment could not be checked.",
  );
});
