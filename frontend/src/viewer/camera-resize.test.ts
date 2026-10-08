import { expect, it } from "vitest";
import { resizeZoomFactor } from "./camera-resize";

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
