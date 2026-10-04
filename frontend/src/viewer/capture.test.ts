import { describe, expect, it, vi } from "vitest";
import type { GLViewer } from "3dmol";
import { captureDimensions, captureView } from "./capture";
describe("Native export resolution and restoration", () => {
  it("bounds geometry rendering while retaining the requested aspect ratio", () => {
    expect(captureDimensions(400, 300, 2)).toEqual([800, 600]);
    const [w, h] = captureDimensions(4000, 3000, 3);
    expect(w * h).toBeLessThanOrEqual(8 * 1024 ** 2);
    expect(w / h).toBeCloseTo(4 / 3, 2);
    expect(() => captureDimensions(0, 300, 2)).toThrow();
    expect(() => captureDimensions(400, 300, 100)).toThrow();
  });
  it("restores the source viewport and camera even if native PNG capture fails", () => {
    const element = document.createElement("div");
    element.style.width = "100%";
    vi.spyOn(element, "getBoundingClientRect").mockReturnValue({
      width: 400,
      height: 300,
    } as DOMRect);
    const view = [0, 1, 2, 3];
    const setView = vi.fn(),
      resize = vi.fn();
    const viewer = {
      getView: () => view,
      setView,
      resize,
      render: vi.fn(),
      pngURI: () => {
        throw new Error("native unavailable");
      },
    } as unknown as GLViewer;
    expect(() => captureView(viewer, element, 2)).toThrow("native unavailable");
    expect(element.style.width).toBe("100%");
    expect(element.style.height).toBe("");
    expect(setView).toHaveBeenLastCalledWith(view);
    expect(resize).toHaveBeenCalledTimes(2);
  });
});
