import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import bootstrapScript from "../public/theme-init.js?raw";
import appHtml from "../index.html?raw";
import tokenStyles from "./tokens.css?raw";

let stopSync: (() => void) | undefined;

beforeEach(() => {
  vi.resetModules();
  localStorage.clear();
  sessionStorage.clear();
  for (const key of ["theme", "themeReady", "themeStorageWarning"])
    delete document.documentElement.dataset[key];
  document.head.innerHTML = '<meta name="theme-color" content="#f5f3ed" />';
  const style = document.createElement("style");
  style.textContent = tokenStyles;
  document.head.append(style);
});

afterEach(() => {
  stopSync?.();
  stopSync = undefined;
  vi.restoreAllMocks();
  document.head.innerHTML = "";
});

async function startTheme() {
  const theme = await import("./theme");
  stopSync = theme.initializeTheme();
  return theme;
}

describe("theme persistence", () => {
  it.each([
    ["warm", "#f5f3ed"],
    ["light", "#ffffff"],
    ["dark", "#181817"],
  ])("restores the saved %s theme", async (saved, color) => {
    localStorage.setItem("x-dde-theme", saved);
    const theme = await startTheme();
    expect(theme.getThemeSnapshot()).toEqual({
      theme: saved,
      storageWarning: false,
    });
    expect(document.documentElement.dataset.theme).toBe(saved);
    expect(document.querySelector('meta[name="theme-color"]')).toHaveAttribute(
      "content",
      color,
    );
  });

  it.each([null, "", "sepia", "DARK"])(
    "defaults to warm for an absent or invalid preference (%s)",
    async (saved) => {
      if (saved !== null) localStorage.setItem("x-dde-theme", saved);
      const theme = await startTheme();
      expect(theme.getThemeSnapshot()).toEqual({
        theme: "warm",
        storageWarning: false,
      });
    },
  );

  it("persists a selection and applies its browser color", async () => {
    const theme = await startTheme();
    theme.setTheme("dark");
    expect(localStorage.getItem(theme.THEME_STORAGE_KEY)).toBe("dark");
    expect(document.documentElement.dataset.theme).toBe("dark");
    expect(theme.getThemeSnapshot()).toEqual({
      theme: "dark",
      storageWarning: false,
    });
    expect(document.querySelector('meta[name="theme-color"]')).toHaveAttribute(
      "content",
      "#181817",
    );
  });

  it("remains usable when the browser denies reading storage", async () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new DOMException("Storage is disabled", "SecurityError");
    });
    const theme = await startTheme();
    expect(theme.getThemeSnapshot()).toEqual({
      theme: "warm",
      storageWarning: true,
    });
    theme.setTheme("dark");
    expect(theme.getThemeSnapshot()).toEqual({
      theme: "dark",
      storageWarning: false,
    });
  });

  it("applies a selection and reports failed persistence, then recovers", async () => {
    const theme = await startTheme();
    const write = vi
      .spyOn(Storage.prototype, "setItem")
      .mockImplementationOnce(() => {
        throw new DOMException("Storage is full", "QuotaExceededError");
      });
    theme.setTheme("dark");
    expect(document.documentElement.dataset.theme).toBe("dark");
    expect(theme.getThemeSnapshot().storageWarning).toBe(true);
    expect(localStorage.getItem(theme.THEME_STORAGE_KEY)).toBeNull();
    theme.setTheme("light");
    expect(write).toHaveBeenLastCalledWith(theme.THEME_STORAGE_KEY, "light");
    expect(theme.getThemeSnapshot().storageWarning).toBe(false);
    expect(localStorage.getItem(theme.THEME_STORAGE_KEY)).toBe("light");
  });

  it("synchronizes other tabs without writing the preference again", async () => {
    const theme = await startTheme();
    const write = vi.spyOn(Storage.prototype, "setItem");
    window.dispatchEvent(
      new StorageEvent("storage", {
        key: theme.THEME_STORAGE_KEY,
        newValue: "dark",
        storageArea: localStorage,
      }),
    );
    expect(theme.getThemeSnapshot().theme).toBe("dark");
    window.dispatchEvent(
      new StorageEvent("storage", {
        key: "another-preference",
        newValue: "light",
        storageArea: localStorage,
      }),
    );
    window.dispatchEvent(
      new StorageEvent("storage", {
        key: theme.THEME_STORAGE_KEY,
        newValue: "light",
        storageArea: sessionStorage,
      }),
    );
    expect(theme.getThemeSnapshot().theme).toBe("dark");
    window.dispatchEvent(
      new StorageEvent("storage", { key: null, storageArea: localStorage }),
    );
    expect(theme.getThemeSnapshot().theme).toBe("warm");
    expect(write).not.toHaveBeenCalled();
  });

  it("rejects invalid themes from another tab and removes its listener", async () => {
    const theme = await startTheme();
    theme.setTheme("dark");
    window.dispatchEvent(
      new StorageEvent("storage", {
        key: theme.THEME_STORAGE_KEY,
        newValue: "unknown",
        storageArea: localStorage,
      }),
    );
    expect(theme.getThemeSnapshot().theme).toBe("warm");
    stopSync?.();
    stopSync = undefined;
    window.dispatchEvent(
      new StorageEvent("storage", {
        key: theme.THEME_STORAGE_KEY,
        newValue: "dark",
        storageArea: localStorage,
      }),
    );
    expect(theme.getThemeSnapshot().theme).toBe("warm");
  });
});

describe("theme before the app loads", () => {
  it.each(["warm", "light", "dark"])(
    "restores %s in the synchronous bootstrap and hands it to React",
    async (saved) => {
      localStorage.setItem("x-dde-theme", saved);
      new Function(bootstrapScript)();
      expect(document.documentElement.dataset.theme).toBe(saved);
      const read = vi.spyOn(Storage.prototype, "getItem");
      const theme = await startTheme();
      expect(theme.getThemeSnapshot()).toEqual({
        theme: saved,
        storageWarning: false,
      });
      expect(read).not.toHaveBeenCalled();
    },
  );

  it("uses the default for invalid bootstrap data", () => {
    localStorage.setItem("x-dde-theme", "unsupported");
    new Function(bootstrapScript)();
    expect(document.documentElement.dataset.theme).toBe("warm");
  });

  it("preserves an initial storage error so settings can explain it", async () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new DOMException("Storage is disabled", "SecurityError");
    });
    new Function(bootstrapScript)();
    expect(document.documentElement.dataset.theme).toBe("warm");
    const theme = await startTheme();
    expect(theme.getThemeSnapshot().storageWarning).toBe(true);
  });

  it("loads blocking theme styles and the same-origin script before the body", () => {
    const html = new DOMParser().parseFromString(appHtml, "text/html");
    const styles = html.head.querySelector('link[href="/src/tokens.css"]');
    const script = html.head.querySelector('script[src="/theme-init.js"]');
    expect(styles).not.toBeNull();
    expect(script).not.toBeNull();
    expect(script!.getAttribute("type")).not.toBe("module");
    expect(script!.hasAttribute("async")).toBe(false);
    expect(script!.hasAttribute("defer")).toBe(false);
    expect(styles!.compareDocumentPosition(script!)).toBe(
      Node.DOCUMENT_POSITION_FOLLOWING,
    );
    expect(html.querySelector("script:not([src])")).toBeNull();
  });
});

function luminance(hex: string) {
  const channels = hex
    .slice(1)
    .match(/.{2}/g)!
    .map((channel) => parseInt(channel, 16) / 255)
    .map((channel) =>
      channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4,
    );
  return channels[0] * 0.2126 + channels[1] * 0.7152 + channels[2] * 0.0722;
}

it.each(["warm", "light", "dark"])(
  "%s text, actions and status colors meet normal-text contrast",
  (theme) => {
    document.documentElement.dataset.theme = theme;
    const styles = getComputedStyle(document.documentElement);
    const pairs = [
      ["ink", "canvas"],
      ["ink", "surface"],
      ["muted", "canvas"],
      ["muted", "sidebar"],
      ["muted", "surface-muted"],
      ["accent", "accent-soft"],
      ["accent-contrast", "accent"],
      ["success", "success-soft"],
      ["warning", "warning-soft"],
      ["danger", "danger-soft"],
      ["info", "info-soft"],
    ];
    for (const [foreground, background] of pairs) {
      const levels = [foreground, background].map((token) =>
        luminance(styles.getPropertyValue(`--${token}`).trim()),
      );
      const ratio = (Math.max(...levels) + 0.05) / (Math.min(...levels) + 0.05);
      expect(
        ratio,
        `${theme}: ${foreground} on ${background}`,
      ).toBeGreaterThanOrEqual(4.5);
    }
  },
);
