import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { api } from "../api";
import { useBoltzMsa } from "./useBoltzMsa";
import type { MoleculeRef } from "../research/types";

afterEach(() => vi.restoreAllMocks());
const first: MoleculeRef = {
  asset_id: "11111111-1111-4111-8111-111111111111",
  sha256: "a".repeat(64),
  record: 0,
  conformer: 0,
};
const second = {
  ...first,
  asset_id: "22222222-2222-4222-8222-222222222222",
  sha256: "b".repeat(64),
};
const inspection = {
  rows: 2,
  unique_sequences: 2,
  columns: 4,
  name: "protein.a3m",
};

it("owns responses by exact file and protein and aborts stale reads", async () => {
  const pending: { reply(value: unknown): void; signal: AbortSignal }[] = [];
  vi.spyOn(api, "authorized").mockImplementation(
    async (_path, init) =>
      new Promise((resolve) =>
        pending.push({
          reply: resolve as (value: unknown) => void,
          signal: init.signal as AbortSignal,
        }),
      ) as never,
  );
  const { result, rerender, unmount } = renderHook(
    ({ reference, sequence }) => useBoltzMsa(reference, sequence),
    { initialProps: { reference: first, sequence: "ACDE" } },
  );
  await waitFor(() => expect(pending).toHaveLength(1));
  rerender({ reference: second, sequence: "ACDF" });
  await waitFor(() => expect(pending).toHaveLength(2));
  expect(pending[0].signal.aborted).toBe(true);
  await act(async () => pending[0].reply(inspection));
  expect(result.current.value).toBeNull();
  await act(async () =>
    pending[1].reply({ ...inspection, name: "second.csv" }),
  );
  await waitFor(() => expect(result.current.value?.name).toBe("second.csv"));
  unmount();
  expect(pending[1].signal.aborted).toBe(true);
});

it.each([
  null,
  { ...inspection, rows: 0 },
  { ...inspection, columns: 3 },
  { ...inspection, unique_sequences: 3 },
])(
  "rejects malformed inspection and supports an owned bounded retry (%j)",
  async (value) => {
    const call = vi
      .spyOn(api, "authorized")
      .mockResolvedValueOnce(value as never)
      .mockResolvedValueOnce(inspection);
    const { result } = renderHook(() => useBoltzMsa(first, "ACDE"));
    await waitFor(() => expect(result.current.error).toBe(true));
    act(() => result.current.retry());
    expect(result.current.error).toBe(false);
    expect(result.current.value).toBeNull();
    await waitFor(() => expect(result.current.value).toEqual(inspection));
    expect(call).toHaveBeenCalledTimes(2);
  },
);
