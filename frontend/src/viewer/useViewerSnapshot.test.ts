import { expect, it } from "vitest";
import { validSnapshot } from "./useViewerSnapshot";
it("accepts bounded PNGs and refuses active documents or oversized payloads", () => {
  expect(
    validSnapshot({ id: "capture", png: "data:image/png;base64,iVBORw0KGgo=" }),
  ).toBe(true);
  expect(
    validSnapshot({
      id: "capture",
      png: "data:image/svg+xml,<svg onload='alert(1)'/>",
    }),
  ).toBe(false);
  expect(
    validSnapshot({
      id: "capture",
      png: "data:image/png;base64," + "A".repeat(64 * 1024 ** 2),
    }),
  ).toBe(false);
  expect(validSnapshot(null)).toBe(false);
});
