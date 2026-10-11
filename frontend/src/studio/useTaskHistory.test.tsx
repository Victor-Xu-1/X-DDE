import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { api } from "../api";
import { useTaskHistory } from "./useTaskHistory";
import type { HistoryFilter, TaskHistoryPage } from "./task-history-model";
const initial: HistoryFilter = {
  module: "binding",
  type: "all",
  status: "all",
  query: "",
  page: 0,
  project: null,
};
const page: TaskHistoryPage = {
  items: [],
  counts: { "gnina.dock": { total: 4, active: 0 } },
  total: 0,
  offset: 0,
  limit: 20,
};
afterEach(() => vi.restoreAllMocks());

it("rejects a late reply from a previous module and aborts it", async () => {
  let finish!: (value: TaskHistoryPage) => void;
  const fetch = vi
    .spyOn(api, "taskHistory")
    .mockImplementationOnce(() => new Promise((resolve) => (finish = resolve)))
    .mockResolvedValue({
      ...page,
      counts: { properties: { total: 2, active: 0 } },
    });
  const { result, rerender } = renderHook((filter) => useTaskHistory(filter), {
    initialProps: initial,
  });
  const signal = fetch.mock.calls[0][1]!;
  rerender({ ...initial, module: "evaluation" });
  expect(signal.aborted).toBe(true);
  await waitFor(() => expect(result.current.counts.properties.total).toBe(2));
  await act(async () => finish(page));
  expect(result.current.counts["gnina.dock"]).toBeUndefined();
});
it("hides stale rows while changing filters and retains only same-project counts", async () => {
  const fetch = vi
    .spyOn(api, "taskHistory")
    .mockResolvedValueOnce(page)
    .mockImplementation(() => new Promise(() => {}));
  const { result, rerender } = renderHook((filter) => useTaskHistory(filter), {
    initialProps: initial,
  });
  await waitFor(() => expect(result.current.data).toEqual(page));
  rerender({ ...initial, query: "another" });
  expect(result.current.data).toBeNull();
  expect(result.current.counts["gnina.dock"].total).toBe(4);
  rerender({ ...initial, project: "new-project" });
  expect(result.current.counts).toEqual({});
  expect(fetch).toHaveBeenCalledTimes(3);
});
it("reports failure, retries explicitly, and refuses invalid response shapes", async () => {
  const fetch = vi
    .spyOn(api, "taskHistory")
    .mockResolvedValueOnce([] as never)
    .mockResolvedValue(page);
  const { result } = renderHook(() => useTaskHistory(initial));
  await waitFor(() => expect(result.current.error).toBe(true));
  expect(result.current.data).toBeNull();
  act(() => result.current.refresh());
  await waitFor(() => expect(result.current.data).toEqual(page));
  expect(fetch).toHaveBeenCalledTimes(2);
});
