import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { api, request } from "../api";
import {
  readReferenceHistory,
  useReferenceHistory,
} from "./useReferenceHistory";
vi.mock("../api", () => ({ request: vi.fn(), api: { assets: vi.fn() } }));
afterEach(() => {
  cleanup();
  vi.resetAllMocks();
});
const file = (id: string) => ({
  id,
  name: id + ".pdb",
  kind: "structure" as const,
  suffix: ".pdb",
  sha256: "a".repeat(64),
  size: 100,
  created_at: "",
});
it("includes older uploads beyond the first asset page without mutating the API response", async () => {
  const first = Array.from({ length: 100 }, (_, i) => file(String(i)));
  vi.mocked(api.assets).mockResolvedValue(first);
  vi.mocked(request).mockImplementation(async (path) =>
    path.startsWith("/research") ? [] : [file("older")],
  );
  const result = await readReferenceHistory(new AbortController().signal);
  expect(result.files).toHaveLength(101);
  expect(result.files[100].id).toBe("older");
  expect(first).toHaveLength(100);
  expect(request).toHaveBeenCalledWith(
    "/assets?limit=100&offset=100",
    expect.anything(),
  );
});
it("does not fetch from the fresh-file route and can explicitly retry the failed history load", async () => {
  vi.mocked(request)
    .mockRejectedValueOnce(new Error("private server path"))
    .mockResolvedValue([]);
  vi.mocked(api.assets).mockResolvedValue([file("recovered")]);
  const view = renderHook(
    ({ active }) => useReferenceHistory("structure", [".pdb"], active),
    { initialProps: { active: false } },
  );
  expect(request).not.toHaveBeenCalled();
  view.rerender({ active: true });
  await waitFor(() => expect(view.result.current.error).toBe(true));
  expect(view.result.current.files).toEqual([]);
  act(() => view.result.current.retry());
  await waitFor(() =>
    expect(view.result.current.files[0]?.id).toBe("recovered"),
  );
  expect(view.result.current.error).toBe(false);
});
