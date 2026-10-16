import { expect, it, vi } from "vitest";
import type { GLViewer } from "3dmol";
import { paintSearchBox, searchBoxGeometry } from "./search-box";
import { viewerLoad } from "./source-layout";

const box = { center: [12, -4, 30], size: [16, 20, 24], unit: "angstrom" };
it("retains explicit receptor coordinates and units through the shared viewer protocol", () => {
  const before = JSON.stringify(box);
  const load = viewerLoad({
    urls: ["/api/assets/source"],
    comparison: false,
    searchBox: box,
  });
  expect(load.searchBox).toEqual(box);
  expect(JSON.stringify(box)).toBe(before);
  for (const invalid of [
    null,
    { ...box, unit: "nm" },
    { ...box, center: [NaN, 0, 0] },
    { ...box, center: [1, 2] },
    { ...box, size: [0, 20, 20] },
    { ...box, size: [16, 20, Infinity] },
  ])
    expect(() =>
      viewerLoad({
        urls: ["/api/assets/source"],
        comparison: false,
        searchBox: invalid,
      }),
    ).toThrow();
});
it("draws exactly 12 edges at the explicit extents without adding or moving atoms", () => {
  const viewer = { addCylinder: vi.fn(), addModel: vi.fn() };
  const geometry = searchBoxGeometry(box)!;
  const before = JSON.stringify(geometry);
  paintSearchBox(viewer as unknown as GLViewer, geometry);
  expect(viewer.addCylinder).toHaveBeenCalledTimes(12);
  expect(viewer.addCylinder).toHaveBeenCalledWith(
    expect.objectContaining({
      start: { x: 4, y: -14, z: 18 },
      end: { x: 20, y: -14, z: 18 },
    }),
  );
  expect(viewer.addCylinder).toHaveBeenCalledWith(
    expect.objectContaining({
      start: { x: 20, y: 6, z: 18 },
      end: { x: 20, y: 6, z: 42 },
    }),
  );
  expect(viewer.addModel).not.toHaveBeenCalled();
  expect(JSON.stringify(geometry)).toBe(before);
});
