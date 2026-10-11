import { StrictMode } from "react";
import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import * as client from "../api";
import type { Asset } from "./types";
import { useResultReuse } from "./useResultReuse";
const file = { name: "STAT6.sdf", size: 847 };
const metadata = { ...file, job_id: "source", sha256: "a".repeat(64) };
const asset: Asset = {
  id: "asset",
  kind: "ligand",
  suffix: ".sdf",
  name: file.name,
  size: file.size,
  sha256: metadata.sha256,
  created_at: "2026-10-11",
};
beforeEach(() => {
  vi.spyOn(client, "request").mockResolvedValue(metadata);
});
afterEach(() => vi.restoreAllMocks());
it("retains exact metadata and the same save key after a lost reply and coalesces repeated clicks", async () => {
  const save = vi
    .spyOn(client.api, "authorized")
    .mockRejectedValueOnce(new Error("Lost response"))
    .mockResolvedValueOnce(asset);
  const confirmed = vi.fn(),
    pending = vi.fn();
  const { result } = renderHook(
    () =>
      useResultReuse(
        "source",
        file,
        "ligand",
        [".sdf"],
        1024,
        confirmed,
        pending,
      ),
    { wrapper: StrictMode },
  );
  await act(() => result.current.save());
  expect(result.current.error).toBe("unavailable");
  await act(() => Promise.all([result.current.save(), result.current.save()]));
  expect(save).toHaveBeenCalledTimes(2);
  expect(client.request).toHaveBeenCalledOnce();
  const calls = save.mock.calls;
  expect(new Headers(calls[0][1].headers).get("Idempotency-Key")).toBe(
    new Headers(calls[1][1].headers).get("Idempotency-Key"),
  );
  expect(calls[0][0]).toContain("expected_sha256=" + metadata.sha256);
  expect(confirmed).toHaveBeenCalledExactlyOnceWith(asset);
  expect(pending).toHaveBeenCalledTimes(2);
});
it("cancels late registration after switching source and allows the new choice immediately", async () => {
  let finish!: (value: Asset) => void;
  const save = vi
    .spyOn(client.api, "authorized")
    .mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }) as never,
    )
    .mockResolvedValueOnce(asset);
  const confirmed = vi.fn();
  vi.mocked(client.request).mockImplementation(
    async (path) =>
      ({
        ...metadata,
        job_id: path.includes("other") ? "other" : "source",
      }) as never,
  );
  const { result, rerender } = renderHook(
    ({ job }) => useResultReuse(job, file, "ligand", [".sdf"], 1024, confirmed),
    { initialProps: { job: "source" } },
  );
  let old!: Promise<void>;
  await act(async () => {
    old = result.current.save();
  });
  await waitFor(() => expect(save).toHaveBeenCalledOnce());
  rerender({ job: "other" });
  await act(() => result.current.save());
  await act(async () => {
    finish({ ...asset, id: "old" });
    await old;
  });
  expect(confirmed).toHaveBeenCalledExactlyOnceWith(asset);
  expect(save.mock.calls[0][1].signal?.aborted).toBe(true);
});
it.each([
  { ...asset, sha256: "b".repeat(64) },
  { ...asset, size: 848 },
  { ...asset, name: "other.sdf" },
  { ...asset, kind: "structure" },
])(
  "rejects a saved reply inconsistent with the exact source %j",
  async (value) => {
    vi.spyOn(client.api, "authorized").mockResolvedValue(value);
    const confirmed = vi.fn(),
      { result } = renderHook(() =>
        useResultReuse("source", file, "ligand", [".sdf"], 1024, confirmed),
      );
    await act(() => result.current.save());
    expect(result.current.error).toBe("identity");
    expect(confirmed).not.toHaveBeenCalled();
  },
);
it.each([
  { ...metadata, job_id: "other" },
  { ...metadata, name: "other.sdf" },
  { ...metadata, sha256: "bad" },
])("never mutates after mismatched source metadata %j", async (value) => {
  vi.mocked(client.request).mockResolvedValue(value);
  const save = vi.spyOn(client.api, "authorized"),
    confirmed = vi.fn(),
    { result } = renderHook(() =>
      useResultReuse("source", file, "ligand", [".sdf"], 1024, confirmed),
    );
  await act(() => result.current.save());
  expect(save).not.toHaveBeenCalled();
  expect(result.current.error).toBe("identity");
});
it("rejects a late reply after unmount or externally replacing the current input", async () => {
  let finish!: (value: Asset) => void;
  const save = vi.spyOn(client.api, "authorized").mockImplementation(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }) as never,
  );
  const confirmed = vi.fn(),
    { result, rerender, unmount } = renderHook(
      ({ input }) =>
        useResultReuse(
          "source",
          file,
          "ligand",
          [".sdf"],
          1024,
          confirmed,
          undefined,
          input,
        ),
      { initialProps: { input: "old" } },
    );
  let old!: Promise<void>;
  await act(async () => {
    old = result.current.save();
  });
  await waitFor(() => expect(save).toHaveBeenCalledOnce());
  rerender({ input: "replacement" });
  unmount();
  await act(async () => {
    finish(asset);
    await old;
  });
  expect(confirmed).not.toHaveBeenCalled();
  expect(save.mock.calls[0][1].signal?.aborted).toBe(true);
});
it.each([
  [409, "changed"],
  [422, "incompatible"],
] as const)(
  "distinguishes an authoritative %s response from a retryable network failure",
  async (status, expected) => {
    vi.spyOn(client.api, "authorized").mockRejectedValue(
      new client.ApiError(status, "Controlled private failure"),
    );
    const { result } = renderHook(() =>
      useResultReuse("source", file, "ligand", [".sdf"], 1024, vi.fn()),
    );
    await act(() => result.current.save());
    expect(result.current.error).toBe(expected);
  },
);

it("does not accept a registration reply delivered after the request deadline", async () => {
  const deadline = new AbortController();
  vi.spyOn(AbortSignal, "timeout").mockReturnValue(deadline.signal);
  let finish!: (value: Asset) => void;
  const save = vi.spyOn(client.api, "authorized").mockImplementation(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }) as never,
  );
  const confirmed = vi.fn();
  const { result } = renderHook(() =>
    useResultReuse("source", file, "ligand", [".sdf"], 1024, confirmed),
  );
  let pending!: Promise<void>;
  await act(async () => {
    pending = result.current.save();
  });
  await waitFor(() => expect(save).toHaveBeenCalledOnce());
  await act(async () => {
    deadline.abort(new DOMException("Deadline", "TimeoutError"));
    finish(asset);
    await pending;
  });
  expect(confirmed).not.toHaveBeenCalled();
  expect(result.current.error).toBe("unavailable");
  expect(result.current.busy).toBe(false);
});
