import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { usePredictionPlotSize } from "./PredictionPlotSize";

afterEach(() => {
  cleanup();
  document.body.replaceChildren();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

function paneSize(viewportWidth: number, paneHeight = 810) {
  vi.stubGlobal("innerWidth", viewportWidth);
  const host = document.createElement("div");
  host.className = "prediction-result";
  const pane = document.createElement("aside");
  pane.className = "structure-workbench-details";
  pane.style.overflowY = "auto";
  const element = document.createElement("section");
  const canvas = document.createElement("div");
  canvas.className = "research-plot-canvas";
  element.append(canvas);
  pane.append(element);
  host.append(pane);
  document.body.append(host);
  Object.defineProperty(pane, "clientHeight", { get: () => paneHeight });
  Object.defineProperty(pane, "clientWidth", { get: () => 808 });
  vi.spyOn(pane, "getBoundingClientRect").mockReturnValue({
    top: 0,
  } as DOMRect);
  vi.spyOn(canvas, "getBoundingClientRect").mockReturnValue({
    top: 114,
  } as DOMRect);
  const disconnect = vi.fn();
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe = vi.fn();
      disconnect = disconnect;
    },
  );
  const frames = new Map<number, FrameRequestCallback>();
  let nextFrame = 0;
  vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
    frames.set(++nextFrame, callback);
    return nextFrame;
  });
  vi.stubGlobal("cancelAnimationFrame", (id: number) => frames.delete(id));
  const hook = renderHook(usePredictionPlotSize);
  const flush = () =>
    act(() => {
      const pending = [...frames.values()];
      frames.clear();
      pending.forEach((callback) => callback(0));
    });
  act(() => hook.result.current.elementRef(element));
  flush();
  return { ...hook, flush, frames, disconnect };
}

it("uses the available wide matrix pane and restores compact sizing after resize", () => {
  const view = paneSize(2560);
  expect(view.result.current.height).toBeGreaterThan(420);
  expect(view.result.current.height).toBeLessThanOrEqual(810 - 114);
  vi.stubGlobal("innerWidth", 800);
  act(() => window.dispatchEvent(new Event("resize")));
  view.flush();
  expect(view.result.current.height).toBe(420);
  act(() => window.dispatchEvent(new Event("resize")));
  expect(view.frames.size).toBe(1);
  view.unmount();
  expect(view.frames.size).toBe(0);
  expect(view.disconnect).toHaveBeenCalledOnce();
});

it("retains the regular maximum and respects a height-bounded wide pane", () => {
  const regular = paneSize(1440);
  expect(regular.result.current.height).toBe(420);
  regular.unmount();
  const bounded = paneSize(2560, 450);
  expect(bounded.result.current.height).toBeGreaterThanOrEqual(180);
  expect(bounded.result.current.height).toBeLessThanOrEqual(450 - 114);
});
