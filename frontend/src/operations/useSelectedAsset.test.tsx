import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import * as client from "../api";
import { useSelectedAsset } from "./useSelectedAsset";
import type { Asset } from "./types";

const asset: Asset = {
  id: "selected",
  name: "STAT6.pdb",
  kind: "structure",
  suffix: ".pdb",
  size: 100,
  sha256: "a".repeat(64),
  created_at: "2026-10-11",
};
afterEach(() => vi.restoreAllMocks());
it("cancels late metadata when the input kind changes", async () => {
  let finish!: (value: Asset) => void;
  const read = vi
    .spyOn(client, "request")
    .mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }) as never,
    )
    .mockResolvedValue({ ...asset, kind: "ligand", suffix: ".sdf" });
  const { result, rerender } = renderHook(
    ({ kind }: { kind: "structure" | "ligand" }) =>
      useSelectedAsset(
        asset.id,
        kind,
        [kind === "structure" ? ".pdb" : ".sdf"],
        1024,
        null,
      ),
    { initialProps: { kind: "structure" } },
  );
  rerender({ kind: "ligand" });
  await waitFor(() => expect(result.current.asset?.kind).toBe("ligand"));
  await act(() => finish(asset));
  expect(result.current.asset?.kind).toBe("ligand");
  expect(read.mock.calls[0][1]?.signal?.aborted).toBe(true);
});
it.each([
  { ...asset, id: "other" },
  { ...asset, kind: "ligand" },
  { ...asset, size: 2048 },
  { ...asset, sha256: "bad" },
])(
  "rejects incompatible metadata and supports an explicit retry",
  async (invalid) => {
    const read = vi
      .spyOn(client, "request")
      .mockResolvedValueOnce(invalid)
      .mockResolvedValueOnce(asset);
    const { result } = renderHook(() =>
      useSelectedAsset(asset.id, "structure", [".pdb"], 1024, null),
    );
    await waitFor(() => expect(result.current.error).toBe(true));
    expect(result.current.asset).toBeNull();
    act(() => result.current.retry());
    await waitFor(() => expect(result.current.asset).toEqual(asset));
    expect(read).toHaveBeenCalledTimes(2);
    expect(result.current.error).toBe(false);
  },
);
