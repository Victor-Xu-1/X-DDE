import { afterEach, beforeEach, expect, it, vi } from "vitest";
import bootstrap from "../public/theme-init.js?raw";

let dispose: (() => void) | undefined;
beforeEach(() => {
  vi.resetModules();
  localStorage.clear();
  for (const key of ["theme", "themeReady", "themeStorageWarning"])
    delete document.documentElement.dataset[key];
});
afterEach(() => {
  dispose?.();
  dispose = undefined;
  vi.restoreAllMocks();
});

it("offers warm, white and night as three independent preferences", async () => {
  const theme = await import("./theme");
  dispose = theme.initializeTheme();
  expect(theme.THEMES).toEqual(["warm", "light", "dark"]);
});
it("retains a saved warm choice before React loads and across tabs", async () => {
  localStorage.setItem("x-dde-theme", "warm");
  new Function(bootstrap)();
  expect(document.documentElement.dataset.theme).toBe("warm");
  const theme = await import("./theme");
  dispose = theme.initializeTheme();
  expect(theme.getThemeSnapshot().theme).toBe("warm");
  window.dispatchEvent(
    new StorageEvent("storage", {
      key: "x-dde-theme",
      newValue: "dark",
      storageArea: localStorage,
    }),
  );
  expect(theme.getThemeSnapshot().theme).toBe("dark");
  const write = vi.spyOn(Storage.prototype, "setItem");
  window.dispatchEvent(
    new StorageEvent("storage", {
      key: "x-dde-theme",
      newValue: "warm",
      storageArea: localStorage,
    }),
  );
  expect(theme.getThemeSnapshot().theme).toBe("warm");
  expect(write).not.toHaveBeenCalled();
});
it("preserves the existing warm appearance when no preference was saved", async () => {
  new Function(bootstrap)();
  expect(document.documentElement.dataset.theme).toBe("warm");
  const theme = await import("./theme");
  dispose = theme.initializeTheme();
  expect(theme.getThemeSnapshot()).toEqual({
    theme: "warm",
    storageWarning: false,
  });
});
