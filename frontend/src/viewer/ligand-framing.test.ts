import { expect, it, vi } from "vitest";
import type { AtomSpec, GLViewer, XYZ } from "3dmol";
import { currentLigandAspect, fitStandaloneLigand } from "./ligand-framing";

const stick = { stick: {} };
function scene(atoms: AtomSpec[], width = 600, height = 400) {
  let scale = 1;
  const view = [0, 0, 0, 20, 0, 0, 0, 1];
  const viewer = {
    selectedAtoms: () => atoms,
    getCanvas: () => ({
      getBoundingClientRect: () => ({ width, height, left: 10, top: 20 }),
    }),
    modelToScreen: vi.fn((points: XYZ[]) =>
      points.map(({ x, y }) => ({
        x: width / 2 + 10 + x * scale,
        y: height / 2 + 20 + y * scale,
      })),
    ),
    getView: () => view,
    setView: vi.fn(),
    zoom: vi.fn((value: number) => {
      scale *= value;
    }),
  };
  return { viewer, native: viewer as unknown as GLViewer, view };
}

it("fits visible atoms against the limiting axis and ignores hidden or invalid atoms", () => {
  const { viewer, native } = scene([
    { x: -95, y: -140, z: 0, style: stick },
    { x: 85, y: 100, z: 0, style: stick },
    { x: 999, y: 0, z: 0, style: {} },
    { x: 2, y: Infinity, z: 0, style: stick },
  ]);
  expect(fitStandaloneLigand(native)).toBeCloseTo(95 / 140);
  expect(viewer.zoom).toHaveBeenCalledExactlyOnceWith(0.78 / 0.7);
  expect(currentLigandAspect(native)).toBeCloseTo(95 / 140);
});

it("limits magnification of a small projection and keeps a degenerate view on the legacy fit", () => {
  const { native, viewer } = scene([
    { x: -16, y: 1, z: 0, style: stick },
    { x: 16, y: 0, z: 0, style: stick },
  ]);
  expect(fitStandaloneLigand(native)).toBeGreaterThan(1);
  expect(viewer.zoom).toHaveBeenCalledExactlyOnceWith(1.9);

  const small = scene([{ x: 0, y: 0, z: 0, style: stick }]);
  expect(fitStandaloneLigand(small.native)).toBeUndefined();
  expect(small.viewer.zoom).not.toHaveBeenCalled();
});

it("restores the snapshot if a perspective correction cannot fit the visible atoms", () => {
  const { native, viewer, view } = scene([
    { x: -90, y: -40, z: 0, style: stick },
    { x: 90, y: 40, z: 0, style: stick },
  ]);
  viewer.modelToScreen
    .mockReturnValueOnce([
      { x: 220, y: 160 },
      { x: 400, y: 240 },
    ])
    .mockReturnValue([
      { x: 10, y: 20 },
      { x: 610, y: 420 },
    ]);
  expect(fitStandaloneLigand(native)).toBeUndefined();
  expect(viewer.zoom).toHaveBeenCalledTimes(2);
  expect(viewer.setView).toHaveBeenCalledExactlyOnceWith(view);
});
