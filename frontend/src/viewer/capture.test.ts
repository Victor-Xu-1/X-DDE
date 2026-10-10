import { describe, expect, it, vi } from "vitest";
import type { GLViewer } from "3dmol";
import { captureDimensions, captureView, captureFigure } from "./capture";
import { defaultFigure } from "../publication/settings";
// The native WebGL worker has no JSDOM canvas. Browser gates use the real SDK;
// this isolated test checks capture dimensions and exact restoration on failure.
vi.mock("3dmol", () => ({
  Vector2: class {
    constructor(
      public x: number,
      public y: number,
    ) {}
  },
}));
describe("Native export resolution and restoration", () => {
  it("bounds geometry rendering while retaining the requested aspect ratio", () => {
    expect(captureDimensions(400, 300, 2)).toEqual([800, 600]);
    const [w, h] = captureDimensions(4000, 3000, 3);
    expect(w * h).toBeLessThanOrEqual(8 * 1024 ** 2);
    expect(w / h).toBeCloseTo(4 / 3, 2);
    const [retinaWidth, retinaHeight] = captureDimensions(1800, 1200, 3, 2);
    expect(retinaWidth * retinaHeight * 4).toBeLessThanOrEqual(8 * 1024 ** 2);
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
      getCanvas: () => ({ width: 400 }),
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
it.each([
  { dpi: 600 as const, width: 2102, height: 1577 },
  { dpi: 300 as const, width: 1051, height: 788 },
  { dpi: 600 as const, shape: "square" as const, width: 2102, height: 2102 },
  { dpi: 300 as const, shape: "landscape" as const, width: 1051, height: 701 },
  { dpi: 300 as const, shape: "portrait" as const, width: 1051, height: 1401 },
])(
  "renders $dpi dpi at exact print pixels and restores the native camera on failure",
  ({ dpi, shape, width: expectedWidth, height: expectedHeight }) => {
    const element = document.createElement("div");
    element.style.width = "100%";
    vi.spyOn(element, "getBoundingClientRect").mockReturnValue({
      width: 400,
      height: 300,
    } as DOMRect);
    let width = 800,
      height = 600;
    const camera = [0, 1, 2, 3],
      setView = vi.fn(),
      background = vi.fn();
    const viewer = {
      getView: () => camera,
      getCanvas: () => ({ width, height }),
      getRenderer: () => ({ devicePixelRatio: 2 }),
      setWidth: (value: number) => {
        width = Math.trunc(value * 2);
      },
      setHeight: (value: number) => {
        height = Math.trunc(value * 2);
      },
      setView,
      setBackgroundColor: background,
      resize: () => {
        width = element.style.width.endsWith("px")
          ? Math.round(parseFloat(element.style.width) * 2)
          : 800;
        height = element.style.height.endsWith("px")
          ? Math.round(parseFloat(element.style.height) * 2)
          : 600;
      },
      render: vi.fn(),
      pngURI: () => {
        expect([width, height]).toEqual([expectedWidth, expectedHeight]);
        throw new Error("native capture failed");
      },
    } as unknown as GLViewer;
    expect(() =>
      captureFigure(viewer, element, { ...defaultFigure, dpi, shape }),
    ).toThrow("native capture failed");
    expect(element.style.width).toBe("100%");
    expect(element.style.height).toBe("");
    expect([width, height]).toEqual([800, 600]);
    expect(setView).toHaveBeenLastCalledWith(camera);
    expect(background).toHaveBeenLastCalledWith("white", 1);
  },
);
