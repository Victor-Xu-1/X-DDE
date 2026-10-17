import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { request } from "../api";
import { useReferenceHistory } from "./useReferenceHistory";
import { catalogFixture } from "./input-catalog.test-fixtures";
vi.mock("../api", () => ({ request: vi.fn() }));
afterEach(() => vi.resetAllMocks());
const file = {
  id: "older",
  name: "STAT6-receptor.pdb",
  kind: "structure" as const,
  suffix: ".pdb",
  sha256: "a".repeat(64),
  size: 100,
  created_at: "",
};
it("reads one server-filtered page with literal search and no whole-history fanout", async () => {
  vi.mocked(request).mockResolvedValue(catalogFixture([], [file]));
  const { result } = renderHook(() =>
    useReferenceHistory("structure", [".pdb"], true, {
      query: "STAT6 %_",
      page: 402,
      selected: "file:older",
      wholeFile: false,
    }),
  );
  await waitFor(() => expect(result.current.files[0].id).toBe("older"));
  expect(request).toHaveBeenCalledOnce();
  const params = new URLSearchParams(
    vi.mocked(request).mock.calls[0][0].split("?")[1],
  );
  expect(params.get("offset")).toBe("10050");
  expect(params.get("q")).toBe("STAT6 %_");
  expect(params.getAll("formats")).toEqual([".pdb"]);
});
it("does not read the fresh route and offers explicit retry after a failed catalog request", async () => {
  vi.mocked(request)
    .mockRejectedValueOnce(new Error("/private/state"))
    .mockResolvedValue(catalogFixture([], [file]));
  const view = renderHook(
    ({ active }) => useReferenceHistory("structure", [".pdb"], active),
    { initialProps: { active: false } },
  );
  expect(request).not.toHaveBeenCalled();
  view.rerender({ active: true });
  await waitFor(() => expect(view.result.current.error).toBe(true));
  act(() => view.result.current.retry());
  await waitFor(() => expect(view.result.current.files[0].id).toBe("older"));
});
it("aborts a previous query and never restores its late options", async () => {
  let reply!: (value: unknown) => void;
  vi.mocked(request)
    .mockImplementationOnce(() => new Promise((resolve) => (reply = resolve)))
    .mockResolvedValue(catalogFixture());
  const view = renderHook(
    ({ query }) =>
      useReferenceHistory("structure", [".pdb"], true, {
        query,
        page: 0,
        selected: "",
        wholeFile: false,
      }),
    { initialProps: { query: "first" } },
  );
  const signal = vi.mocked(request).mock.calls[0][1]!.signal!;
  view.rerender({ query: "second" });
  expect(signal.aborted).toBe(true);
  await waitFor(() => expect(view.result.current.loading).toBe(false));
  await act(async () => reply(catalogFixture([], [file])));
  expect(view.result.current.files).toEqual([]);
});

it("retains source task captions for the selected version outside a filtered page", async () => {
  const selected = {
    key: "version:native",
    origin: "saved",
    version: { id: "native" },
    source_task: { id: "study", name: "STAT6 neural recovery" },
  };
  vi.mocked(request).mockResolvedValue({ ...catalogFixture(), selected });
  const { result } = renderHook(() =>
    useReferenceHistory("ligand", [".sdf"], true),
  );
  await waitFor(() =>
    expect(result.current.sourceTasks.native).toEqual(selected.source_task),
  );
  expect(result.current.versions).toEqual([]);
  expect(request).toHaveBeenCalledOnce();
});
