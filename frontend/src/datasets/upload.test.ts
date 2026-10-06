/// <reference types="node" />
import { File } from "node:buffer";
import { webcrypto } from "node:crypto";
import { beforeEach, expect, it, vi } from "vitest";
import { uploadDataset } from "./upload";

const transport = vi.hoisted(() => ({
  request: vi.fn(),
  post: vi.fn(),
  authorized: vi.fn(),
}));
vi.mock("../api", () => ({
  request: transport.request,
  api: { post: transport.post, authorized: transport.authorized },
}));
beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal("crypto", webcrypto);
});
const hash = async (file: Blob) =>
  Buffer.from(
    await webcrypto.subtle.digest("SHA-256", await file.arrayBuffer()),
  ).toString("hex");
const state = {
  id: "upload1",
  name: "BRD4.csv",
  kind: "counts",
  size: 40,
  offset: 13,
  state: "uploading",
  asset_id: null,
};
const callbacks = () => ({
  signal: new AbortController().signal,
  key: "key1",
  resume: "upload1",
  onState: vi.fn(),
  onProgress: vi.fn(),
});

it("validates every confirmed partial chunk before resuming the exact bytes", async () => {
  const file = new File(
    ["x".repeat(40)],
    "BRD4.csv",
  ) as unknown as globalThis.File;
  transport.request
    .mockResolvedValueOnce(state)
    .mockResolvedValueOnce([
      { offset: 0, size: 13, sha256: await hash(file.slice(0, 13)) },
    ]);
  transport.authorized
    .mockResolvedValueOnce({ ...state, offset: 40 })
    .mockResolvedValueOnce({ id: "verified-asset" });
  const options = callbacks();
  expect(await uploadDataset(file, "counts", options)).toEqual({
    id: "verified-asset",
  });
  expect(transport.authorized.mock.calls[0][0]).toContain("offset=13");
  expect(transport.authorized.mock.calls[0][1].body.size).toBe(27);
  expect(options.onProgress).toHaveBeenLastCalledWith(40, 40);
});
it("rejects a different file with the same name and size without sending new bytes", async () => {
  const first = new File(
    ["x".repeat(40)],
    "BRD4.csv",
  ) as unknown as globalThis.File;
  const changed = new File(
    ["y".repeat(40)],
    "BRD4.csv",
  ) as unknown as globalThis.File;
  transport.request
    .mockResolvedValueOnce(state)
    .mockResolvedValueOnce([
      { offset: 0, size: 13, sha256: await hash(first.slice(0, 13)) },
    ]);
  await expect(uploadDataset(changed, "counts", callbacks())).rejects.toThrow(
    "different file bytes",
  );
  expect(transport.authorized).not.toHaveBeenCalled();
});
it("does not publish an asset if the server accepts an unexpected offset", async () => {
  const file = new File(
    ["x".repeat(40)],
    "BRD4.csv",
  ) as unknown as globalThis.File;
  transport.post.mockResolvedValueOnce({ ...state, offset: 0 });
  transport.authorized.mockResolvedValueOnce({ ...state, offset: 39 });
  await expect(
    uploadDataset(file, "counts", { ...callbacks(), resume: undefined }),
  ).rejects.toThrow("different upload position");
  expect(transport.authorized).toHaveBeenCalledTimes(1);
});
