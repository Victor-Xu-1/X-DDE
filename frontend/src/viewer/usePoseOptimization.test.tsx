import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { api, request } from "../api";
import { usePoseOptimization } from "./usePoseOptimization";
import type { PreviewPose, SavedPose } from "./pose-types";

vi.mock("../api", () => ({
  api: { post: vi.fn(), cancel: vi.fn() },
  request: vi.fn(),
}));
afterEach(() => vi.clearAllMocks());
const old = "7b9bd02b-0b93-45f4-a8b9-80e1cff203c9",
  next = "a63a8a8d-d805-4d31-86c0-c5f92cd1ac28";
const base: PreviewPose = {
  urls: [`/api/assets/${old}`],
  source: { kind: "asset", asset_id: old, record: 2 },
  receptor: null,
};
const saved = {
  job_id: next,
  pose: {
    id: next,
    kind: "molecule",
    reference: { asset_id: next, version_id: next, record: 0, conformer: 0 },
    source_job: next,
    relation: "edited_from",
  },
  energy: {
    before: 20,
    after: 10,
    unit: "kcal/mol",
    method: "MMFF94s",
    converged: true,
  },
  native_score: null,
  receptor: null,
} as SavedPose;

it("saves then switches pose, supports undo/redo, and minimizes the actually selected pose", async () => {
  vi.mocked(api.post).mockImplementation(async (path) =>
    path.endsWith("/save") ? saved : { id: next },
  );
  vi.mocked(request).mockResolvedValue({ id: next, status: "succeeded" });
  const { result } = renderHook(() => usePoseOptimization(base, 0));
  await act(async () => {
    await result.current.minimize("MMFF94s", 1000);
  });
  await waitFor(() => expect(result.current.count).toBe(2));
  expect(result.current.downloadUrl).toBe(`/api/assets/${next}`);
  expect(result.current.pose.energy?.after).toBe(10);
  act(() => result.current.previous());
  expect(result.current.pose.urls).toEqual(base.urls);
  act(() => result.current.next());
  expect(result.current.pose.urls).toEqual([`/api/assets/${next}`]);
  act(() => result.current.previous());
  await act(async () => {
    await result.current.minimize("UFF", 300);
  });
  await waitFor(() => expect(result.current.cursor).toBe(1));
  expect(result.current.count).toBe(2); // A new branch returns to its actual parent on undo.
  expect(
    vi
      .mocked(api.post)
      .mock.calls.filter((c) => c[0].endsWith("minimize"))[1][1],
  ).toMatchObject({ source: base.source, method: "UFF" });
});

it("keeps the prior pose and stable submission key after an uncertain transport failure", async () => {
  vi.mocked(api.post).mockRejectedValue(new Error("Network timeout"));
  const { result } = renderHook(() => usePoseOptimization(base, 0));
  await act(async () => {
    await result.current.minimize("MMFF94s", 1000);
  });
  expect(result.current.pose).toEqual(base);
  await act(async () => {
    await result.current.minimize("MMFF94s", 1000);
  });
  expect(vi.mocked(api.post).mock.calls[0][2]).toBe(
    vi.mocked(api.post).mock.calls[1][2],
  );
  expect(result.current.count).toBe(1);
});

it("does not activate an old task's result after switching molecules", async () => {
  let finish: (value: SavedPose) => void = () => {};
  vi.mocked(api.post).mockImplementation(async (path) =>
    path.endsWith("/save")
      ? new Promise((resolve) => {
          finish = resolve;
        })
      : { id: next },
  );
  vi.mocked(request).mockResolvedValue({ id: next, status: "succeeded" });
  const { result, rerender } = renderHook(
    ({ input }) => usePoseOptimization(input, 0),
    { initialProps: { input: base } },
  );
  await act(async () => {
    await result.current.minimize("MMFF94s", 1000);
  });
  await waitFor(() => expect(result.current.phase).toBe("saving"));
  const another = {
    ...base,
    urls: [`/api/assets/${next}`],
    source: { kind: "asset", asset_id: next, record: 0 },
  } as PreviewPose;
  rerender({ input: another });
  await act(async () => finish(saved));
  expect(result.current.pose).toEqual(another);
  expect(result.current.count).toBe(1);
  expect(api.cancel).not.toHaveBeenCalled(); // Navigation leaves durable background work alone.
});
