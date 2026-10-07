import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterEach } from "vitest";
afterEach(cleanup);
// JSDOM has no layout/ResizeObserver. Pixel geometry is verified in Chromium;
// component tests opt into their own measurements when checking resize behavior.
Object.defineProperty(globalThis, "ResizeObserver", {
  writable: true,
  configurable: true,
  value: class {
    observe() {}
    unobserve() {}
    disconnect() {}
  },
});
