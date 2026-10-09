import type { AtomSpec } from "3dmol";
import { expect, it, vi } from "vitest";
import { retainSourceDepth } from "./source-depth";

function fixture(atoms: AtomSpec[], view = [-100, 0, 0, -80, 0, 0, 0, 1]) {
  return {
    selectedAtoms: vi.fn(() => atoms),
    getView: vi.fn(() => view),
    getSlab: vi.fn(() => ({ near: -20, far: 20 })),
    setSlab: vi.fn(),
  };
}
it("retains all source depth around an off-center pocket without moving coordinates, rotation or target", () => {
  const atoms = [
    { x: 0, y: 0, z: 0 },
    { x: 120, y: 0, z: 0 },
  ] as AtomSpec[];
  const before = JSON.stringify(atoms),
    viewer = fixture(atoms),
    camera = [...viewer.getView()];
  expect(retainSourceDepth(viewer)).toBe(true);
  expect(viewer.setSlab).toHaveBeenCalledWith(-104, 104);
  expect(viewer.selectedAtoms).toHaveBeenCalledWith({});
  expect(viewer.getView()).toEqual(camera);
  expect(JSON.stringify(atoms)).toBe(before);
});
it("preserves an already wider depth range", () => {
  const viewer = fixture([{ x: 100, y: 0, z: 0 }] as AtomSpec[]);
  viewer.getSlab.mockReturnValue({ near: -150, far: 170 });
  expect(retainSourceDepth(viewer)).toBe(false);
  expect(viewer.setSlab).not.toHaveBeenCalled();
});
it("does not derive depth from absent or non-finite source geometry", () => {
  const viewer = fixture([{ x: NaN, y: 0, z: 0 }] as AtomSpec[]);
  expect(retainSourceDepth(viewer)).toBe(false);
  expect(viewer.setSlab).not.toHaveBeenCalled();
  viewer.getView.mockReturnValue([Infinity, 0, 0]);
  expect(retainSourceDepth(viewer)).toBe(false);
});
