import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { readFepSeries } from "./fep-series";
import { useFepSeries } from "./useFepSeries";
vi.mock("./fep-series", () => ({ readFepSeries: vi.fn() }));
afterEach(() => {
  cleanup();
  vi.resetAllMocks();
});
const source = {
  asset_id: "series",
  sha256: "a".repeat(64),
  record: 0,
  conformer: 0,
};
it("a deadline or read failure can be retried without losing selection, and an obsolete source cannot win", async () => {
  let late: (value: { record: number; name: string }[]) => void = () => {};
  vi.mocked(readFepSeries)
    .mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          late = resolve;
        }),
    )
    .mockRejectedValueOnce(new DOMException("Read deadline", "TimeoutError"))
    .mockResolvedValueOnce([{ record: 0, name: "Current series" }]);
  const view = renderHook(({ value }) => useFepSeries(value), {
    initialProps: { value: source },
  });
  view.rerender({ value: { ...source, asset_id: "next" } });
  await waitFor(() =>
    expect(view.result.current.error).toBeInstanceOf(DOMException),
  );
  await act(async () => {
    late([{ record: 0, name: "Old series" }]);
  });
  expect(view.result.current.records).toBeUndefined();
  act(() => view.result.current.retry());
  await waitFor(() =>
    expect(view.result.current.records?.[0].name).toBe("Current series"),
  );
  expect(readFepSeries).toHaveBeenCalledTimes(3);
});
it("does not fetch for dynamics and aborts the read when its questionnaire is closed", () => {
  vi.mocked(readFepSeries).mockImplementation(() => new Promise(() => {}));
  const idle = renderHook(() => useFepSeries(null));
  expect(readFepSeries).not.toHaveBeenCalled();
  idle.unmount();
  const active = renderHook(() => useFepSeries(source));
  const signal = vi.mocked(readFepSeries).mock.calls[0][1];
  active.unmount();
  expect(signal.aborted).toBe(true);
});
