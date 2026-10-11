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

it("recovers an unavailable environment on demand without remounting its form", async () => {
  const request = vi
    .spyOn(client, "request")
    .mockResolvedValueOnce({ availability: { configuration_present: false } })
    .mockResolvedValueOnce({ availability: { configuration_present: true } });
  const { result } = renderHook(() => useTaskReadiness("properties"));
  await waitFor(() => expect(result.current.ready).toBe(false));
  act(() => result.current.recheck());
  await waitFor(() => expect(result.current.ready).toBe(true));
  expect(request).toHaveBeenCalledTimes(2);
});

it("clears a failed check and ignores a superseded response when checking again", async () => {
  const obsolete = pending(),
    next = pending();
  const request = vi
    .spyOn(client, "request")
    .mockRejectedValueOnce(new TypeError("Failed to fetch"))
    .mockReturnValueOnce(obsolete.promise)
    .mockReturnValueOnce(next.promise);
  const { result } = renderHook(() => useTaskReadiness("properties"));
  await waitFor(() => expect(result.current.error).not.toBe(""));
  act(() => result.current.recheck());
  expect(result.current.ready).toBeUndefined();
  expect(result.current.error).toBe("");
  const signal = request.mock.calls[1][1]!.signal as AbortSignal;
  act(() => result.current.recheck());
  expect(signal.aborted).toBe(true);
  await act(async () =>
    obsolete.resolve({ availability: { configuration_present: true } }),
  );
  expect(result.current.ready).toBeUndefined();
  await act(async () =>
    next.resolve({ availability: { configuration_present: false } }),
  );
  expect(result.current.ready).toBe(false);
});

it("rejects a response that arrives after the bounded readiness deadline", async () => {
  const deadline = new AbortController();
  const timeout = vi
    .spyOn(AbortSignal, "timeout")
    .mockReturnValue(deadline.signal);
  const response = pending();
  vi.spyOn(client, "request").mockReturnValue(response.promise);
  const { result } = renderHook(() => useTaskReadiness("properties"));
  await act(async () => {
    deadline.abort(
      new DOMException("Readiness deadline elapsed", "TimeoutError"),
    );
    response.resolve({ availability: { configuration_present: true } });
  });
  expect(result.current.ready).toBe(false);
  expect(result.current.error).toBe(
    "The calculation environment could not be checked.",
  );
  expect(timeout).toHaveBeenCalledWith(15000);
});

it("shares a single check and recovery between mounted controls for the same capability", async () => {
  const next = pending();
  const request = vi
    .spyOn(client, "request")
    .mockResolvedValueOnce({ availability: { configuration_present: false } })
    .mockReturnValueOnce(next.promise);
  const first = renderHook(() => useTaskReadiness("properties"));
  const second = renderHook(() => useTaskReadiness("properties"));
  await waitFor(() => expect(first.result.current.ready).toBe(false));
  expect(second.result.current.ready).toBe(false);
  expect(request).toHaveBeenCalledOnce();
  act(() => first.result.current.recheck());
  expect(first.result.current.ready).toBeUndefined();
  expect(second.result.current.ready).toBeUndefined();
  await act(async () =>
    next.resolve({ availability: { configuration_present: true } }),
  );
  expect(first.result.current.ready).toBe(true);
  expect(second.result.current.ready).toBe(true);
  expect(request).toHaveBeenCalledTimes(2);
});

it("keeps a shared check alive until its last consumer leaves and starts fresh when revisited", async () => {
  const response = pending();
  const request = vi.spyOn(client, "request").mockReturnValue(response.promise);
  const first = renderHook(() => useTaskReadiness("properties"));
  const second = renderHook(() => useTaskReadiness("properties"));
  const signal = request.mock.calls[0][1]!.signal as AbortSignal;
  first.unmount();
  expect(signal.aborted).toBe(false);
  second.unmount();
  expect(signal.aborted).toBe(true);
  request.mockResolvedValue({ availability: { configuration_present: false } });
  const revisited = renderHook(() => useTaskReadiness("properties"));
  expect(revisited.result.current.ready).toBeUndefined();
  await waitFor(() => expect(revisited.result.current.ready).toBe(false));
  await act(async () =>
    response.resolve({ availability: { configuration_present: true } }),
  );
  expect(revisited.result.current.ready).toBe(false);
  expect(request).toHaveBeenCalledTimes(2);
});
