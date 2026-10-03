import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { api } from "./api";
import { useWorkbench } from "./useWorkbench";
import { defaults } from "./form-model";
import type { Job } from "./types";
afterEach(() => vi.restoreAllMocks());
const job = (id: string): Job => ({
  id,
  status: "succeeded",
  request: {
    name: "BRD4–JQ1",
    components: [{ kind: "protein", value: "ACDEFGHIK", count: 1 }],
    parameters: defaults,
  },
  created_at: "2026-01-01T00:00:00Z",
  started_at: null,
  finished_at: null,
  error: null,
  parent_id: null,
});
function boundary() {
  vi.spyOn(api, "initialize").mockResolvedValue();
  vi.spyOn(api, "health").mockResolvedValue({
    engine: { ready: true },
    worker_ready: true,
  } as never);
  return vi.spyOn(globalThis, "fetch").mockImplementation(
    async (input) =>
      ({
        ok: true,
        json: async () => job(String(input).split("/").at(-1)!),
      }) as Response,
  );
}
it("preserves a new-task selection across refresh instead of selecting an old job", async () => {
  window.history.replaceState(null, "", "/#task=");
  const fetch = boundary();
  const jobs = vi
    .spyOn(api, "jobs")
    .mockResolvedValue([job("11111111-1111-4111-8111-111111111111")]);
  const artifacts = vi.spyOn(api, "artifacts").mockResolvedValue([]);
  const { result, unmount } = renderHook(() => useWorkbench());
  await waitFor(() => expect(result.current.loading).toBe(false));
  expect(result.current.selected).toBe("");
  act(() => result.current.refresh());
  await waitFor(() => expect(jobs).toHaveBeenCalledTimes(2));
  expect(result.current.detail).toBeNull();
  expect(artifacts).not.toHaveBeenCalled();
  expect(fetch).not.toHaveBeenCalled();
  unmount();
});
it("cancels the old details on navigation and never downloads internal logs", async () => {
  const first = "11111111-1111-4111-8111-111111111111",
    second = "22222222-2222-4222-8222-222222222222";
  window.history.replaceState(null, "", "/#task=" + first);
  const fetch = boundary();
  vi.spyOn(api, "jobs").mockResolvedValue([]);
  const artifacts = vi
    .spyOn(api, "artifacts")
    .mockResolvedValue([{ name: "BRD4.cif", size: 100 }]);
  const { result, unmount } = renderHook(() => useWorkbench());
  await waitFor(() => expect(result.current.detail?.id).toBe(first));
  act(() => {
    window.history.replaceState(null, "", "/#task=" + second);
    window.dispatchEvent(new HashChangeEvent("hashchange"));
  });
  expect(result.current.selected).toBe(second);
  expect(artifacts.mock.calls[0][1]?.aborted).toBe(true);
  await waitFor(() => expect(result.current.detail?.id).toBe(second));
  expect(
    fetch.mock.calls.every(([url]) => !String(url).endsWith("/logs")),
  ).toBe(true);
  act(() => {
    window.history.replaceState(null, "", "/#task=not-a-task");
    window.dispatchEvent(new PopStateEvent("popstate"));
  });
  expect(result.current.selected).toBe("");
  expect(result.current.detail).toBeNull();
  unmount();
});
