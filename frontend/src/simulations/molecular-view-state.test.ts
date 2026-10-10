import { afterEach, expect, it, vi } from "vitest";
import { visibleViewport } from "./molecular-view-state";
afterEach(() => vi.unstubAllGlobals());
function viewport() {
  const element = document.createElement("div");
  let width = 0;
  Object.defineProperty(element, "offsetWidth", { get: () => width });
  Object.defineProperty(element, "offsetHeight", { get: () => width });
  return {
    element,
    show: () => {
      width = 400;
    },
  };
}
it("does not initialize a hidden view until it receives visible dimensions", async () => {
  const view = viewport(),
    disconnect = vi.fn();
  let changed!: ResizeObserverCallback;
  vi.stubGlobal(
    "ResizeObserver",
    class {
      constructor(callback: ResizeObserverCallback) {
        changed = callback;
      }
      observe = vi.fn();
      disconnect = disconnect;
    },
  );
  const ready = vi.fn();
  const pending = visibleViewport(
    view.element,
    new AbortController().signal,
  ).then(ready);
  await Promise.resolve();
  expect(ready).not.toHaveBeenCalled();
  view.show();
  changed([], {} as ResizeObserver);
  await pending;
  expect(ready).toHaveBeenCalledOnce();
  expect(disconnect).toHaveBeenCalledOnce();
});
it("cancels a hidden model load and removes the viewport observer on unmount", async () => {
  const view = viewport(),
    disconnect = vi.fn(),
    signal = new AbortController();
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe = vi.fn();
      disconnect = disconnect;
    },
  );
  const pending = visibleViewport(view.element, signal.signal);
  signal.abort(new Error("Model source changed"));
  await expect(pending).rejects.toThrow("Model source changed");
  expect(disconnect).toHaveBeenCalledOnce();
});
