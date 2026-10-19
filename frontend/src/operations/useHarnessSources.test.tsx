import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import * as client from "../api";
import { useHarnessSources } from "./useHarnessSources";
import type { Asset } from "./types";

const first: Asset = {
  id: "11111111-1111-4111-8111-111111111111",
  name: "first.pdb",
  kind: "structure",
  suffix: ".pdb",
  sha256: "a".repeat(64),
  size: 900,
  created_at: "2026-10-20",
};
const second = {
  ...first,
  id: "22222222-2222-4222-8222-222222222222",
  name: "second.pdb",
  sha256: "b".repeat(64),
};
afterEach(() => vi.restoreAllMocks());

it("invalidates the old draft immediately and ignores its late response", async () => {
  let finishFirst!: (asset: Asset) => void,
    finishSecond!: (asset: Asset) => void;
  const request = vi.spyOn(client, "request").mockImplementation(
    (path) =>
      new Promise<Asset>((resolve) => {
        if (path.includes(first.id)) finishFirst = resolve;
        else finishSecond = resolve;
      }) as never,
  );
  const { result, rerender } = renderHook(
    ({ id }) => useHarnessSources({ structure_path: `asset:${id}` }, []),
    { initialProps: { id: first.id } },
  );
  await waitFor(() => expect(request).toHaveBeenCalledTimes(1));
  rerender({ id: second.id });
  expect(result.current.ready).toBe(false);
  expect(result.current.references).toEqual([]);
  await act(async () => finishSecond(second));
  await waitFor(() => expect(result.current.ready).toBe(true));
  await act(async () => finishFirst(first));
  expect(result.current.assets).toEqual([second]);
  expect(result.current.references[0].sha256).toBe(second.sha256);
});

it("retains an error until an explicit successful retry and clears removed sources", async () => {
  vi.spyOn(client, "request")
    .mockRejectedValueOnce(new Error("unavailable"))
    .mockResolvedValue(second);
  const { result, rerender } = renderHook(
    ({ selected }) =>
      useHarnessSources(
        { structure_paths: selected ? [`asset:${second.id}`] : [] },
        [],
      ),
    { initialProps: { selected: true } },
  );
  await waitFor(() => expect(result.current.error).toBe(true));
  expect(result.current.ready).toBe(false);
  act(() => result.current.retry());
  await waitFor(() => expect(result.current.ready).toBe(true));
  rerender({ selected: false });
  expect(result.current.ready).toBe(true);
  expect(result.current.assets).toEqual([]);
  expect(result.current.references).toEqual([]);
});

it("aborts source observation when the form is closed", async () => {
  const request = vi
    .spyOn(client, "request")
    .mockImplementation(() => new Promise(() => {}) as never);
  const { unmount } = renderHook(() =>
    useHarnessSources({ structure_path: `asset:${first.id}` }, []),
  );
  await waitFor(() => expect(request).toHaveBeenCalledOnce());
  const signal = request.mock.calls[0][1]?.signal;
  unmount();
  expect(signal?.aborted).toBe(true);
});
