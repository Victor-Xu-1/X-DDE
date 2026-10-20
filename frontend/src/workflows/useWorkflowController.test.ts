import { act, renderHook, waitFor } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { useWorkflowController } from "./useWorkflowController";
import type { WorkflowRun } from "./types";

const transport = vi.hoisted(() => ({ request: vi.fn(), post: vi.fn() }));
vi.mock("../api", () => ({
  request: transport.request,
  api: { post: transport.post },
}));
const running: WorkflowRun = {
  id: "actual-run",
  plan_id: "plan",
  state: "running",
  reason: null,
  created_at: "2026-10-20T09:54:00Z",
  attempts: [],
};
const completed = { ...running, state: "succeeded" };

it("updates the run selector when the monitored run completes without changing run identity", async () => {
  transport.request.mockImplementation((path: string) =>
    Promise.resolve(path.endsWith("/runs") ? [running] : []),
  );
  const { result } = renderHook(() => useWorkflowController("en", []));
  await waitFor(() => expect(result.current.history).toEqual([running]));
  const record = result.current.recordRun;
  act(() => record(completed));
  expect(result.current.run).toEqual(completed);
  expect(result.current.history).toEqual([completed]);
  expect(result.current.recordRun).toBe(record);
  act(() => result.current.setRun(null));
  expect(result.current.history[0].state).toBe("succeeded");
});

it("does not regress a newly monitored run when the older startup list arrives late", async () => {
  let resolveHistory!: (runs: WorkflowRun[]) => void;
  const history = new Promise<WorkflowRun[]>((resolve) => {
    resolveHistory = resolve;
  });
  transport.request.mockImplementation((path: string) =>
    path.endsWith("/runs") ? history : Promise.resolve([]),
  );
  const { result } = renderHook(() => useWorkflowController("zh", []));
  act(() => result.current.recordRun(completed));
  const older = { ...running, id: "older-run" };
  await act(async () => {
    resolveHistory([running, older]);
    await history;
  });
  expect(result.current.history).toEqual([completed, older]);
  expect(result.current.run).toEqual(completed);
});

it("preserves a loaded template's exact budget rather than applying hidden draft defaults", async () => {
  transport.request.mockResolvedValue([]);
  transport.post.mockImplementation((_path: string, body: unknown) =>
    Promise.resolve({ id: "saved", sha256: "a".repeat(64), body }),
  );
  const preset = {
    name: "Reviewed bounded protocol",
    steps: [],
    budget: { max_jobs: 3, wall_seconds: 300 },
  };
  const { result } = renderHook(() => useWorkflowController("en", [], preset));
  act(() => result.current.setHours(4));
  await act(async () => {
    await result.current.save();
  });
  expect(transport.post).toHaveBeenLastCalledWith(
    "/workflows/plans",
    preset,
    expect.any(String),
  );
});
