import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { request } from "../api";
import { useReferenceSelection } from "./useReferenceSelection";
vi.mock("../api", () => ({ request: vi.fn() }));
afterEach(() => {
  cleanup();
  vi.resetAllMocks();
});
const file = (id: string) => ({
  id,
  sha256: "a".repeat(64),
  kind: "structure",
  suffix: ".pdb",
  size: 100,
});
it("clears the parent immediately and ignores older replies after selection or source cancellation", async () => {
  const pending = new Map<string, (value: unknown) => void>();
  vi.mocked(request).mockImplementation(
    (path) => new Promise((resolve) => pending.set(path, resolve)),
  );
  const change = vi.fn();
  const view = renderHook(() =>
    useReferenceSelection("structure", [".pdb"], change),
  );
  act(() => {
    void view.result.current.choose("A");
  });
  expect(change).toHaveBeenLastCalledWith(null);
  act(() => {
    void view.result.current.choose("B");
  });
  await act(async () => pending.get("/assets/B/metadata")!(file("B")));
  expect(change).toHaveBeenLastCalledWith(
    expect.objectContaining({ asset_id: "B" }),
  );
  const count = change.mock.calls.length;
  await act(async () => pending.get("/assets/A/metadata")!(file("A")));
  expect(change).toHaveBeenCalledTimes(count);
  act(() => {
    void view.result.current.choose("C");
    view.result.current.cancel();
  });
  await act(async () => pending.get("/assets/C/metadata")!(file("C")));
  expect(change).toHaveBeenLastCalledWith(null);
});
it("supports explicit retry after a bounded read failure without restoring the previous input", async () => {
  vi.mocked(request)
    .mockRejectedValueOnce(new DOMException("Deadline", "TimeoutError"))
    .mockResolvedValueOnce(file("B"));
  const change = vi.fn();
  const view = renderHook(() =>
    useReferenceSelection("structure", [".pdb"], change),
  );
  await act(async () => {
    await view.result.current.choose("B");
  });
  expect(view.result.current.error).toBe("unavailable");
  expect(change).toHaveBeenCalledTimes(1);
  await act(async () => {
    view.result.current.retry();
  });
  expect(change).toHaveBeenLastCalledWith(
    expect.objectContaining({ asset_id: "B" }),
  );
  expect(view.result.current.error).toBe("");
});
it("closing the picker cancels metadata and prevents a late parent callback", async () => {
  let reply: (value: unknown) => void = () => {};
  vi.mocked(request).mockImplementation(
    () =>
      new Promise((resolve) => {
        reply = resolve;
      }),
  );
  const change = vi.fn();
  const view = renderHook(() =>
    useReferenceSelection("structure", [".pdb"], change),
  );
  act(() => {
    void view.result.current.choose("A");
  });
  const signal = vi.mocked(request).mock.calls[0][1]?.signal;
  view.unmount();
  expect(signal?.aborted).toBe(true);
  await act(async () => reply(file("A")));
  expect(change).toHaveBeenCalledTimes(1);
});
