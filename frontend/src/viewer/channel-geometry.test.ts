import { afterAll, expect, it, vi } from "vitest";
const worker = vi.hoisted(() =>
  vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:channel-worker"),
);
afterAll(() => worker.mockRestore());
import type * as mol from "3dmol";
import {
  channelGeometry,
  paintChannel,
  focusChannel,
} from "./channel-geometry";
const geometry = {
  envelope: true,
  points: [
    { position: [1, 2, 3] as [number, number, number], radius_angstrom: 1.1 },
    { position: [2, 3, 4] as [number, number, number], radius_angstrom: 0.9 },
  ],
};
it("validates bounded finite native coordinates without accepting spheres as molecular atoms", () => {
  expect(channelGeometry(geometry)).toEqual(geometry);
  for (const bad of [
    null,
    { ...geometry, envelope: 1 },
    { ...geometry, points: [] },
    {
      ...geometry,
      points: [
        { ...geometry.points[0], position: [NaN, 2, 3] },
        geometry.points[1],
      ],
    },
    {
      ...geometry,
      points: [
        { ...geometry.points[0], radius_angstrom: 0 },
        geometry.points[1],
      ],
    },
  ])
    expect(() => channelGeometry(bad)).toThrow();
});
it("paints shapes and sampled clearance while preserving source coordinates and atom identity", () => {
  const before = JSON.stringify(geometry);
  const viewer = {
    addCylinder: vi.fn(),
    addSphere: vi.fn(),
    addLabel: vi.fn(),
    addModel: vi.fn(),
  };
  paintChannel(viewer as unknown as mol.GLViewer, channelGeometry(geometry));
  expect(viewer.addModel).not.toHaveBeenCalled();
  expect(viewer.addCylinder).toHaveBeenCalledWith(
    expect.objectContaining({
      start: { x: 1, y: 2, z: 3 },
      end: { x: 2, y: 3, z: 4 },
    }),
  );
  expect(viewer.addLabel).toHaveBeenCalledWith(
    "0.90 Å",
    expect.objectContaining({ position: { x: 2, y: 3, z: 4 } }),
  );
  expect(JSON.stringify(geometry)).toBe(before);
});

it("focuses actual finite source atoms around native geometry without creating atoms", () => {
  const viewer = {
    selectedAtoms: vi.fn(() => [{ x: 1, y: 2, z: 3 }]),
    zoomTo: vi.fn(),
    zoom: vi.fn(),
    render: vi.fn(),
    addModel: vi.fn(),
  };
  const before = JSON.stringify(geometry);
  focusChannel(viewer as unknown as mol.GLViewer, geometry);
  const selection = viewer.zoomTo.mock.calls[0][0] as mol.AtomSelectionSpec;
  expect(selection.predicate!({ x: 1, y: 2, z: 3 })).toBe(true);
  expect(selection.predicate!({ x: 1000, y: 2, z: 3 })).toBe(false);
  expect(selection.predicate!({ x: NaN, y: 2, z: 3 })).toBe(false);
  expect(viewer.addModel).not.toHaveBeenCalled();
  expect(JSON.stringify(geometry)).toBe(before);
});
