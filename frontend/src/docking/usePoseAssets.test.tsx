import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { usePoseAssets } from "./usePoseAssets";
import { poseAssetMessage, type PoseAssetTarget } from "./pose-asset-lookup";
const mocks = vi.hoisted(() => ({ read: vi.fn(), authorized: vi.fn() }));
vi.mock("../api", () => ({
  request: mocks.read,
  api: { authorized: mocks.authorized },
}));
const target: PoseAssetTarget = {
  name: "pose.sdf",
  kind: "molecule",
  record: 0,
};
const version = (job = "a", record = 0, name = "pose.sdf") => ({
  id: `${job}-${name}-${record}`,
  source_job: job,
  kind: "molecule",
  label: "Renamed material",
  reference: {
    version_id: `${job}-${name}-${record}`,
    asset_id: "saved-file",
    sha256: "a".repeat(64),
    record,
    conformer: 0,
  },
});
function transport(path: string) {
  const url = new URL(path, "https://local.invalid");
  if (path.includes("artifact-metadata"))
    return {
      job_id: url.pathname.split("/")[2],
      name: url.searchParams.get("name"),
      size: 123,
      sha256: "a".repeat(64),
    };
  return [
    version(
      url.searchParams.get("source_job")!,
      Number(url.searchParams.get("record")),
      url.searchParams.get("asset_name")!,
    ),
  ];
}
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  mocks.read.mockReset();
  mocks.authorized.mockReset();
});

it("queries the original file hash and exact record rather than a thousand-row label scan", async () => {
  mocks.read.mockImplementation(transport);
  const { result } = renderHook(() =>
    usePoseAssets("a", [{ ...target, record: 499 }]),
  );
  await waitFor(() =>
    expect(
      result.current.object({ ...target, record: 499 })?.reference.record,
    ).toBe(499),
  );
  expect(mocks.read).toHaveBeenCalledTimes(2);
  const query = new URL(mocks.read.mock.calls[1][0], "https://local.invalid")
    .searchParams;
  expect(Object.fromEntries(query)).toEqual({
    source_job: "a",
    asset_name: "pose.sdf",
    sha256: "a".repeat(64),
    kind: "molecule",
    record: "499",
    limit: "1",
  });
  expect(mocks.authorized).not.toHaveBeenCalled();
});

it("clears old eligibility immediately and ignores a late old task reply", async () => {
  const held = deferred<ReturnType<typeof version>[]>();
  mocks.read.mockImplementation((path: string) =>
    path.includes("source_job=a") ? held.promise : transport(path),
  );
  const { result, rerender } = renderHook(
    ({ job }) => usePoseAssets(job, [target]),
    { initialProps: { job: "a" } },
  );
  await waitFor(() => expect(mocks.read).toHaveBeenCalledTimes(2));
  const signal = mocks.read.mock.calls[1][1].signal as AbortSignal;
  rerender({ job: "b" });
  expect(result.current.object(target)).toBeUndefined();
  expect(signal.aborted).toBe(true);
  await waitFor(() =>
    expect(result.current.object(target)?.source_job).toBe("b"),
  );
  await act(async () => held.resolve([version("a")]));
  expect(result.current.object(target)?.source_job).toBe("b");
});

it("coalesces repeated registration and preserves a newly selected candidate", async () => {
  mocks.read.mockImplementation(transport);
  const held = deferred<{ state: string; count: number; errors: unknown[] }>();
  mocks.authorized.mockReturnValue(held.promise);
  const { result, rerender } = renderHook(
    ({ name }) => usePoseAssets("a", [{ ...target, name }]),
    { initialProps: { name: "pose.sdf" } },
  );
  await waitFor(() => expect(result.current.object(target)).toBeDefined());
  let first!: Promise<void>, second!: Promise<void>;
  act(() => {
    first = result.current.refresh();
    second = result.current.refresh();
  });
  expect(first).toBe(second);
  expect(mocks.authorized).toHaveBeenCalledTimes(1);
  rerender({ name: "other.sdf" });
  const other = { ...target, name: "other.sdf" };
  await waitFor(() =>
    expect(result.current.object(other)?.id).toContain("other.sdf"),
  );
  await act(async () =>
    held.resolve({ state: "complete", count: 3, errors: [] }),
  );
  expect(result.current.object(other)?.id).toContain("other.sdf");
  expect(result.current.busy).toBe(false);
});

it("recovers a committed registration through a read retry without registering again", async () => {
  let committed = false;
  mocks.read.mockImplementation((path: string) =>
    path.includes("/research/objects") && !committed ? [] : transport(path),
  );
  mocks.authorized.mockImplementation(() => {
    committed = true;
    return Promise.reject(new Error("private /srv/log/trace"));
  });
  const { result } = renderHook(() => usePoseAssets("a", [target]));
  await waitFor(() => expect(result.current.busy).toBe(false));
  await act(async () => {
    await result.current.refresh();
  });
  expect(result.current.error).toBe("unavailable");
  expect(poseAssetMessage(result.current.error, false)).not.toContain("/srv/");
  await act(async () => {
    await result.current.retry();
  });
  expect(result.current.object(target)?.id).toBe(version().id);
  expect(mocks.authorized).toHaveBeenCalledTimes(1);
});

it.each(["source", "hash", "record", "version"])(
  "rejects a mismatched %s in the saved material",
  async (field) => {
    const bad = version();
    if (field === "source") bad.source_job = "wrong";
    if (field === "hash") bad.reference.sha256 = "b".repeat(64);
    if (field === "record") bad.reference.record = 1;
    if (field === "version") bad.reference.version_id = "other";
    mocks.read.mockImplementation((path: string) =>
      path.includes("/research/objects") ? [bad] : transport(path),
    );
    const { result } = renderHook(() => usePoseAssets("a", [target]));
    await waitFor(() => expect(result.current.error).toBe("identity"));
    expect(result.current.object(target)).toBeUndefined();
  },
);

it("cancel and unmount prevent late loading or registration from reviving an input", async () => {
  const held = deferred<ReturnType<typeof version>[]>();
  mocks.read.mockImplementation((path: string) =>
    path.includes("/research/objects") ? held.promise : transport(path),
  );
  const { result, unmount } = renderHook(() => usePoseAssets("a", [target]));
  await waitFor(() => expect(mocks.read).toHaveBeenCalledTimes(2));
  act(() => result.current.cancel());
  await act(async () => held.resolve([version()]));
  expect(result.current.object(target)).toBeUndefined();
  expect(result.current.busy).toBe(false);
  unmount();
  expect((mocks.read.mock.calls[1][1].signal as AbortSignal).aborted).toBe(
    true,
  );
});

it("uses one bounded deadline across metadata and saved-version reads", async () => {
  const deadline = new AbortController();
  vi.spyOn(AbortSignal, "timeout").mockReturnValue(deadline.signal);
  mocks.read.mockImplementation(
    (_path: string, init: RequestInit) =>
      new Promise((_resolve, reject) => {
        init.signal!.addEventListener(
          "abort",
          () => reject(new Error("deadline")),
          { once: true },
        );
      }),
  );
  const { result } = renderHook(() => usePoseAssets("a", [target]));
  await waitFor(() => expect(result.current.busy).toBe(true));
  await act(async () => deadline.abort());
  await waitFor(() => expect(result.current.error).toBe("unavailable"));
  expect(result.current.busy).toBe(false);
  expect(AbortSignal.timeout).toHaveBeenCalledWith(30000);
});
