import { act, renderHook } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";
import { useBatchCandidates } from "./useBatchCandidates";
import { request } from "../api";
import type { AvailableDataset } from "./types";

vi.mock("../api", () => ({ request: vi.fn() }));
beforeEach(() => vi.clearAllMocks());
const source = (job_id: string) =>
  [
    { job_id, role: "screening", report_sha256: "a".repeat(64) },
  ] as AvailableDataset[];
function deferred() {
  let resolve!: (value: unknown) => void;
  const promise = new Promise<unknown>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

it("does not apply a late template selection to a newer personal source", async () => {
  const first = deferred(),
    second = deferred();
  vi.mocked(request)
    .mockReturnValueOnce(first.promise)
    .mockReturnValueOnce(second.promise);
  const { result } = renderHook(() => useBatchCandidates(vi.fn()));
  let previous!: Promise<void>, current!: Promise<void>;
  act(() => {
    previous = result.current.choose(source("template"), ["template-member"]);
  });
  act(() => {
    current = result.current.choose(source("personal"));
  });
  await act(async () => {
    second.resolve({
      candidates: [{ id: "personal-member", artifact: "retained.sdf" }],
    });
    await current;
  });
  await act(async () => {
    first.resolve({
      candidates: [{ id: "template-member", artifact: "retained.sdf" }],
    });
    await previous;
  });
  expect(result.current.source[0].job_id).toBe("personal");
  expect(result.current.selected).toEqual(["personal-member"]);
  expect(result.current.candidates.map((row) => row.id)).toEqual([
    "personal-member",
  ]);
  expect(result.current.ready).toBe(true);
});

it("keeps unavailable template IDs unsubmitable and clears a pending source safely", async () => {
  vi.mocked(request).mockResolvedValueOnce({
    candidates: [{ id: "available", artifact: "retained.sdf" }],
  } as never);
  const { result } = renderHook(() => useBatchCandidates(vi.fn()));
  await act(async () => {
    await result.current.choose(source("template"), ["unavailable"]);
  });
  expect(result.current.ready).toBe(false);
  act(() => result.current.setSelected(["available"]));
  expect(result.current.ready).toBe(true);
  const pending = deferred();
  vi.mocked(request).mockReturnValueOnce(pending.promise);
  let previous!: Promise<void>;
  act(() => {
    previous = result.current.choose(source("other"));
  });
  await act(async () => {
    await result.current.choose([]);
  });
  await act(async () => {
    pending.resolve({
      candidates: [{ id: "other", artifact: "retained.sdf" }],
    });
    await previous;
  });
  expect(result.current.source).toEqual([]);
  expect(result.current.selected).toEqual([]);
  expect(result.current.ready).toBe(false);
});
