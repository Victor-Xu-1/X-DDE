import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { api } from "../api";
import type { Artifact } from "../types";
import { useResultFiles } from "./useResultFiles";
afterEach(() => vi.restoreAllMocks());
it("ignores cancelled late files and keeps the current source's formats and byte limit", async () => {
  let finish!: (value: Artifact[]) => void;
  const read = vi
    .spyOn(api, "artifacts")
    .mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    )
    .mockResolvedValue([
      { name: "STAT6.sdf", size: 800 },
      { name: "audit.sdf", size: 800 },
      { name: "too-large.sdf", size: 2048 },
      { name: "protein.pdb", size: 800 },
    ]);
  const { result, rerender } = renderHook(
    ({ job }) => useResultFiles(job, [".sdf"], 1024),
    { initialProps: { job: "previous" } },
  );
  rerender({ job: "current" });
  await waitFor(() =>
    expect(result.current.files).toEqual([{ name: "STAT6.sdf", size: 800 }]),
  );
  await act(() => finish([{ name: "late.sdf", size: 900 }]));
  expect(result.current.files).toEqual([{ name: "STAT6.sdf", size: 800 }]);
  expect(read.mock.calls[0][1]?.aborted).toBe(true);
});
it("offers an explicit retry and rejects malformed artifact lists", async () => {
  const read = vi
    .spyOn(api, "artifacts")
    .mockResolvedValueOnce([{ name: "invalid.sdf", size: -1 }])
    .mockResolvedValueOnce([{ name: "STAT6.sdf", size: 80 }]);
  const { result } = renderHook(() => useResultFiles("source", [".sdf"], 1024));
  await waitFor(() => expect(result.current.error).toBe(true));
  expect(read).toHaveBeenCalledOnce();
  act(() => result.current.retry());
  await waitFor(() => expect(result.current.files).toHaveLength(1));
  expect(result.current.error).toBe(false);
});
