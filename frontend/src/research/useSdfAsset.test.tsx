import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import * as client from "../api";
import { useSdfAsset } from "./useSdfAsset";

const asset = (id: string) => ({
  id,
  name: id + ".sdf",
  suffix: ".sdf",
  kind: "ligand",
  size: 100,
  sha256: "a".repeat(64),
  created_at: "",
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});
it("keeps only the latest intent and discards an outstanding selection when cleared", async () => {
  const pending = new Map<string, (value: unknown) => void>();
  vi.spyOn(client, "request").mockImplementation(
    (path) => new Promise((resolve) => pending.set(path, resolve)),
  );
  const { result } = renderHook(() => useSdfAsset("en"));
  act(() => {
    void result.current.choose("first");
  });
  expect(result.current.loading).toBe(true);
  act(() => {
    void result.current.choose("second");
  });
  await act(async () =>
    pending.get("/assets/second/metadata")!(asset("second")),
  );
  expect(result.current.asset?.id).toBe("second");
  await act(async () => pending.get("/assets/first/metadata")!(asset("first")));
  expect(result.current.asset?.id).toBe("second");
  act(() => {
    void result.current.choose("third");
  });
  await act(async () => {
    await result.current.choose("");
  });
  await act(async () => pending.get("/assets/third/metadata")!(asset("third")));
  expect(result.current.asset).toBeNull();
  expect(result.current.loading).toBe(false);
});
it.each([
  { id: "other" },
  { suffix: ".pdb" },
  { kind: "structure" },
  { size: 0 },
  { size: 101 },
  { size: 1.5 },
  { sha256: "bad" },
])("rejects mismatched or out-of-bounds metadata %j", async (change) => {
  vi.spyOn(client, "request").mockResolvedValue({
    ...asset("selected"),
    ...change,
  });
  const { result } = renderHook(() => useSdfAsset("en", 100));
  await act(async () => {
    await result.current.choose("selected");
  });
  expect(result.current.asset).toBeNull();
  expect(result.current.error).toContain("SDF file");
  expect(result.current.loading).toBe(false);
});
it("shows metadata service errors and recovers on a new selection", async () => {
  vi.spyOn(client, "request")
    .mockRejectedValueOnce(new Error("Metadata unavailable"))
    .mockResolvedValueOnce(asset("recovered"));
  const { result } = renderHook(() => useSdfAsset("en"));
  await act(async () => {
    await result.current.choose("missing");
  });
  expect(result.current.error).toBe("Metadata unavailable");
  await act(async () => {
    await result.current.choose("recovered");
  });
  await waitFor(() => expect(result.current.asset?.id).toBe("recovered"));
  expect(result.current.error).toBe("");
});
