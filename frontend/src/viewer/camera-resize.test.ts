import { expect, it } from "vitest";
import { resizeZoomFactor, viewportFitFactor } from "./camera-resize";

it("fits both axes on the first portrait render and uses the same scale after resizing", () => {
  const wide = { width: 820, height: 440 },
    narrow = { width: 290, height: 440 };
  expect(viewportFitFactor(wide)).toBe(1);
  expect(viewportFitFactor(narrow)).toBeCloseTo(290 / 440);
  expect(viewportFitFactor(wide) * resizeZoomFactor(wide, narrow)).toBeCloseTo(
    viewportFitFactor(narrow),
  );
  expect(viewportFitFactor({ width: 0, height: 440 })).toBe(1);
  expect(viewportFitFactor({ width: 290, height: Infinity })).toBe(1);
});

it("backs the same view away when the width becomes limiting and reverses without zoom drift", () => {
  const wide = { width: 550, height: 400 },
    narrow = { width: 270, height: 550 };
  expect(resizeZoomFactor(wide, narrow)).toBeCloseTo(270 / 550);
  expect(
    resizeZoomFactor(wide, narrow) * resizeZoomFactor(narrow, wide),
  ).toBeCloseTo(1);
});
it("keeps proportional viewports and hidden/invalid dimensions from changing the camera", () => {
  expect(
    resizeZoomFactor({ width: 300, height: 600 }, { width: 600, height: 1200 }),
  ).toBe(1);
  expect(
    resizeZoomFactor({ width: 0, height: 0 }, { width: 270, height: 400 }),
  ).toBe(1);
  expect(
    resizeZoomFactor({ width: 500, height: 400 }, { width: NaN, height: 400 }),
  ).toBe(1);
});
