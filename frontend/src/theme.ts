import { useSyncExternalStore } from "react";

export const THEME_STORAGE_KEY = "x-dde-theme";
export const THEMES = ["light", "dark"] as const;
export type Theme = (typeof THEMES)[number];

type ThemeState = { theme: Theme; storageWarning: boolean };
const defaultState: ThemeState = { theme: "light", storageWarning: false };
let snapshot: ThemeState | undefined;
const listeners = new Set<() => void>();

function isTheme(value: unknown): value is Theme {
  return value === "light" || value === "dark";
}

function restoreTheme(): ThemeState {
  const { theme, themeReady, themeStorageWarning } =
    document.documentElement.dataset;
  if (themeReady === "true" && isTheme(theme))
    return { theme, storageWarning: themeStorageWarning === "true" };
  try {
    const saved = window.localStorage.getItem(THEME_STORAGE_KEY);
    return {
      theme: isTheme(saved) ? saved : "light",
      storageWarning: false,
    };
  } catch {
    return { theme: "light", storageWarning: true };
  }
}

function applyTheme(state: ThemeState) {
  const root = document.documentElement;
  root.dataset.theme = state.theme;
  root.dataset.themeReady = "true";
  root.dataset.themeStorageWarning = String(state.storageWarning);
  const color = getComputedStyle(root).getPropertyValue("--canvas").trim();
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta && color) meta.setAttribute("content", color);
}

export function getThemeSnapshot(): ThemeState {
  if (!snapshot) {
    snapshot = restoreTheme();
    applyTheme(snapshot);
  }
  return snapshot;
}

function publish(state: ThemeState) {
  applyTheme(state);
  if (
    snapshot?.theme === state.theme &&
    snapshot.storageWarning === state.storageWarning
  )
    return;
  snapshot = state;
  for (const listener of listeners) listener();
}

export function setTheme(theme: Theme) {
  let storageWarning = false;
  try {
    window.localStorage.setItem(THEME_STORAGE_KEY, theme);
  } catch {
    storageWarning = true;
  }
  // A storage restriction must never prevent using the requested appearance.
  publish({ theme, storageWarning });
}

function onStorage(event: StorageEvent) {
  if (event.key !== THEME_STORAGE_KEY && event.key !== null) return;
  if (event.storageArea) {
    try {
      if (event.storageArea !== window.localStorage) return;
    } catch {
      publish({ ...getThemeSnapshot(), storageWarning: true });
      return;
    }
  }
  publish({
    theme: isTheme(event.newValue) ? event.newValue : "light",
    storageWarning: false,
  });
}

// Initialize once at the app entry. The disposer also prevents duplicate
// listeners when Vite replaces the entry during development.
export function initializeTheme() {
  getThemeSnapshot();
  window.addEventListener("storage", onStorage);
  return () => window.removeEventListener("storage", onStorage);
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useTheme() {
  const state = useSyncExternalStore(
    subscribe,
    getThemeSnapshot,
    () => defaultState,
  );
  return { ...state, setTheme };
}
