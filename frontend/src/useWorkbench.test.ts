import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { api } from "./api";
import { useWorkbench } from "./useWorkbench";
import { defaults } from "./form-model";
import type { Health, Job } from "./types";
afterEach(() => vi.restoreAllMocks());
it("keeps an empty project selection empty after a refresh", async () => {
  window.history.replaceState(null, "", "/");
  const job: Job = {
    id: "11111111-1111-4111-8111-111111111111",
    status: "succeeded",
    request: {
      name: "Existing task",
      components: [{ kind: "ligand", value: "CCO", count: 1 }],
      parameters: defaults,
    },
    created_at: "2026-01-01T00:00:00Z",
    started_at: null,
    finished_at: null,
    error: null,
    parent_id: null,
  };
  const health: Health = {
    version: "test",
    engine: { ready: true, gpu: "test", reason: null },
    worker_ready: true,
    worker_error: null,
    free_disk_gib: 100,
    disk_total_gib: 200,
    capabilities: {
      prediction: true,
      msa: false,
      templates: false,
      llm: false,
    },
  };
  vi.spyOn(api, "initialize").mockResolvedValue();
  const jobs = vi.spyOn(api, "jobs").mockResolvedValue([job]);
  vi.spyOn(api, "health").mockResolvedValue(health);
  vi.spyOn(api, "logs").mockResolvedValue({ text: "", truncated: false });
  vi.spyOn(api, "artifacts").mockResolvedValue([]);
  const { result } = renderHook(() => useWorkbench());
  await waitFor(() => expect(result.current.selected).toBe(job.id));
  act(() => result.current.select(""));
  act(() => result.current.refresh());
  await waitFor(() => expect(jobs).toHaveBeenCalledTimes(2));
  expect(result.current.selected).toBe("");
  expect(result.current.detail).toBeNull();
});
