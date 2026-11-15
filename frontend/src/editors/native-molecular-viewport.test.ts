import { expect, it, vi } from "vitest";
import { createMolecularViewport } from "./native-molecular-viewport";

function fixture() {
  const coordinates = Object.freeze({
    min: Object.freeze({ x: 2, y: 4 }),
    max: Object.freeze({ x: 6, y: 8 }),
  });
  const calls: string[] = [];
  let box = { minX: 900, minY: 800, width: 100, height: 50 };
  const editor = {
    struct: () => ({ getCoordBoundingBox: () => coordinates }),
    zoom: vi.fn(() => {
      calls.push("zoom");
    }),
    zoomAccordingContent: vi.fn(() => {
      calls.push("fit");
    }),
    render: {
      clientArea: {
        getBoundingClientRect: () => ({ width: 200, height: 100 }),
      },
      options: { microModeScale: 20, macroModeScale: 1000 },
      resizeViewBox: vi.fn(() => {
        calls.push("size");
        box = { ...box, width: 200, height: 100 };
      }),
      setViewBox: vi.fn((update: (current: typeof box) => typeof box) => {
        calls.push("pan");
        box = update(box);
      }),
    },
    event: {
      zoomChanged: {
        dispatch: vi.fn(() => {
          calls.push("publish");
        }),
      },
    },
  };
  return {
    editor,
    calls,
    coordinates,
    box: () => box,
    viewport: createMolecularViewport(editor),
  };
}
it("refreshes native size and fits with the molecular scale, preserving atom coordinates", () => {
  const f = fixture();
  const original = JSON.stringify(f.coordinates);
  expect(f.viewport.fit()).toBe(true);
  expect(f.calls).toEqual(["size", "zoom", "fit", "pan", "publish"]);
  expect(f.box()).toEqual({ minX: -20, minY: 70, width: 200, height: 100 });
  expect(JSON.stringify(f.coordinates)).toBe(original);
  f.editor.render.options.microModeScale = 40;
  f.viewport.fit();
  expect(f.box()).toEqual({ minX: 60, minY: 190, width: 200, height: 100 });
});
it("defers a hidden viewport and rejects unsupported dimensions instead of changing the drawing", () => {
  const f = fixture();
  f.editor.render.clientArea.getBoundingClientRect = () => ({
    width: 0,
    height: 0,
  });
  expect(f.viewport.fit()).toBe(false);
  expect(f.calls).toEqual([]);
  f.editor.render.clientArea.getBoundingClientRect = () => ({
    width: 200,
    height: 100,
  });
  f.editor.render.options.microModeScale = NaN;
  expect(() => f.viewport.fit()).toThrow("dimensions");
  expect(f.calls).toEqual([]);
  expect(() => createMolecularViewport({})).toThrow("Update");
});
