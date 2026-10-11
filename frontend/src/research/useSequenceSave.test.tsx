import { StrictMode } from "react";
import { act, renderHook } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { api } from "../api";
import { useSequenceSave } from "./useSequenceSave";
import type { Asset } from "../operations/types";

const asset: Asset = {
  id: "sequence",
  kind: "sequences",
  suffix: ".fasta",
  name: "STAT6.fasta",
  size: 847,
  sha256: "a".repeat(64),
  created_at: "2026-10-11",
};
const reference = {
  asset_id: asset.id,
  sha256: asset.sha256,
  record: 0,
  conformer: 0,
  version_id: "version",
};
const version = { id: "version", kind: "sequence", reference };
afterEach(() => vi.restoreAllMocks());

it("reuses the confirmed upload and request key after an uncertain version reply, including StrictMode", async () => {
  const upload = vi.spyOn(api, "upload").mockResolvedValue(asset);
  const post = vi
    .spyOn(api, "post")
    .mockRejectedValueOnce(new Error("Response lost"))
    .mockResolvedValueOnce(version);
  const confirmed = vi.fn();
  const { result } = renderHook(() => useSequenceSave(confirmed), {
    wrapper: StrictMode,
  });
  await act(() => result.current.save("MPAGAV", asset.name));
  expect(result.current.error).toBe("unavailable");
  expect(confirmed).not.toHaveBeenCalled();
  await act(() => result.current.save("MPAGAV", asset.name));
  expect(upload).toHaveBeenCalledOnce();
  expect(post.mock.calls[0][2]).toEqual(post.mock.calls[1][2]);
  expect(post.mock.calls[0][2]).toEqual(expect.any(String));
  expect(confirmed).toHaveBeenCalledExactlyOnceWith(reference);
});
it("does not register or confirm an upload after switching input routes", async () => {
  let finish!: (value: Asset) => void;
  vi.spyOn(api, "upload").mockImplementation(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  const post = vi.spyOn(api, "post"),
    confirmed = vi.fn();
  const { result } = renderHook(() => useSequenceSave(confirmed));
  let pending!: Promise<void>;
  act(() => {
    pending = result.current.save("MPAGAV", asset.name);
  });
  act(() => result.current.detach());
  expect(result.current.busy).toBe(true);
  await act(async () => {
    finish(asset);
    await pending;
  });
  expect(post).not.toHaveBeenCalled();
  expect(confirmed).not.toHaveBeenCalled();
  expect(result.current.busy).toBe(false);
});
it("never confirms a late version after leaving the sequence input", async () => {
  vi.spyOn(api, "upload").mockResolvedValue(asset);
  let finish!: (value: typeof version) => void;
  vi.spyOn(api, "post").mockImplementation(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }) as never,
  );
  const confirmed = vi.fn(),
    { result, unmount } = renderHook(() => useSequenceSave(confirmed));
  let pending!: Promise<void>;
  await act(async () => {
    pending = result.current.save("MPAGAV", asset.name);
  });
  unmount();
  await act(async () => {
    finish(version);
    await pending;
  });
  expect(confirmed).not.toHaveBeenCalled();
});
it("rejects a mismatched sequence version instead of substituting its input", async () => {
  vi.spyOn(api, "upload").mockResolvedValue(asset);
  vi.spyOn(api, "post").mockResolvedValue({
    ...version,
    reference: { ...reference, sha256: "b".repeat(64) },
  });
  const confirmed = vi.fn(),
    { result } = renderHook(() => useSequenceSave(confirmed));
  await act(() => result.current.save("MPAGAV", asset.name));
  expect(result.current.error).toBe("identity");
  expect(confirmed).not.toHaveBeenCalled();
});
