import { BehaviorSubject } from "rxjs";
import { expect, it, vi } from "vitest";
import { waitForMolecularDraw } from "./molecular-first-draw";

function scene() {
  return {
    didDraw: new BehaviorSubject(2),
    commitQueueSize: new BehaviorSubject(1),
    reprCount: new BehaviorSubject(0),
    requestDraw: vi.fn(),
  };
}

it("waits for a new draw with committed native geometry even when layers are hidden", async () => {
  const source = scene();
  const settled = vi.fn();
  const pending = waitForMolecularDraw(
    source,
    new AbortController().signal,
  ).then(settled);
  expect(source.requestDraw).toHaveBeenCalledOnce();
  source.didDraw.next(3);
  source.commitQueueSize.next(0);
  source.didDraw.next(4);
  await Promise.resolve();
  expect(settled).not.toHaveBeenCalled();
  source.reprCount.next(1);
  source.didDraw.next(5);
  await pending;
  expect(settled).toHaveBeenCalledOnce();
  expect(source.didDraw.observed).toBe(false);
});

it("cleans up a cancelled load and ignores subsequent frames", async () => {
  const source = scene();
  const controller = new AbortController();
  const pending = waitForMolecularDraw(source, controller.signal);
  controller.abort();
  await expect(pending).rejects.toMatchObject({ name: "AbortError" });
  expect(source.didDraw.observed).toBe(false);
});
