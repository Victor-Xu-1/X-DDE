import { act, renderHook } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { api } from "../api";
import type { Job } from "../types";
import type { TaskRequest } from "./types";
import { useTaskSubmit } from "./useTaskSubmit";

afterEach(() => vi.restoreAllMocks());
const input = (): TaskRequest => ({
  operation: "properties",
  name: "STAT6 input review",
  smiles: ["O=C(CCN1C=CN=N1)N(C2)CCC=C2C3=C(F)C4=C(C=C(N4)C(N(C)C)=O)C=C3"],
  ligand_files: [],
});
const accepted = (): Job => ({
  id: "58a08fbe-8f0f-49a4-87d8-b760f7ddb3ee",
  request: input(),
  status: "queued",
  created_at: "2026-10-11T00:00:00Z",
  started_at: null,
  finished_at: null,
  error: null,
  parent_id: null,
});

it("locks same-tick calls and sends an isolated input snapshot", async () => {
  let resolve!: (job: Job) => void;
  const send = vi.spyOn(api, "submit").mockImplementation(
    () =>
      new Promise((done) => {
        resolve = done;
      }),
  );
  const onCreated = vi.fn(),
    view = renderHook(() => useTaskSubmit(onCreated));
  const request = input();
  let waiting!: Promise<Job | undefined>;
  act(() => {
    waiting = view.result.current.submit(request);
    void view.result.current.submit(request);
  });
  expect(send).toHaveBeenCalledTimes(1);
  expect(view.result.current.busy).toBe(true);
  if (request.operation === "properties")
    request.smiles[0] = "changed after submission";
  expect(send.mock.calls[0][0]).toEqual(input());
  await act(async () => {
    resolve(accepted());
    await waiting;
  });
  expect(onCreated).toHaveBeenCalledTimes(1);
  expect(view.result.current.busy).toBe(false);
});

it("retains the request key after a lost response and creates a new intent for changed input", async () => {
  const send = vi
    .spyOn(api, "submit")
    .mockRejectedValueOnce(new TypeError("Failed to fetch"))
    .mockResolvedValue(accepted());
  const view = renderHook(() => useTaskSubmit(vi.fn()));
  await act(async () => {
    await view.result.current.submit(input());
  });
  expect(view.result.current.error).toContain("could not be confirmed");
  await act(async () => {
    await view.result.current.submit(input());
  });
  expect(send.mock.calls[1]).toEqual(send.mock.calls[0]);
  await act(async () => {
    await view.result.current.submit({ ...input(), name: "Changed study" });
  });
  expect(send.mock.calls[2][1]).not.toBe(send.mock.calls[1][1]);
});

it("returns the accepted job when result navigation fails and retries only navigation", async () => {
  const send = vi.spyOn(api, "submit").mockResolvedValue(accepted());
  const created = vi.fn().mockImplementationOnce(() => {
    throw new Error("Navigation unavailable");
  });
  vi.spyOn(console, "warn").mockImplementation(() => undefined);
  const view = renderHook(() => useTaskSubmit(created));
  await act(async () => {
    expect(await view.result.current.submit(input())).toEqual(accepted());
  });
  expect(view.result.current.error).toContain("Task created");
  await act(async () => {
    expect(await view.result.current.submit(input())).toEqual(accepted());
  });
  expect(send).toHaveBeenCalledTimes(1);
  expect(created).toHaveBeenCalledTimes(2);
  expect(view.result.current.error).toBe("");
});

it("does not open a result page after its form is unmounted", async () => {
  let resolve!: (job: Job) => void;
  vi.spyOn(api, "submit").mockImplementation(
    () =>
      new Promise((done) => {
        resolve = done;
      }),
  );
  const created = vi.fn(),
    view = renderHook(() => useTaskSubmit(created));
  let waiting!: Promise<Job | undefined>;
  act(() => {
    waiting = view.result.current.submit(input());
  });
  view.unmount();
  await act(async () => {
    resolve(accepted());
    expect(await waiting).toEqual(accepted());
  });
  expect(created).not.toHaveBeenCalled();
});
