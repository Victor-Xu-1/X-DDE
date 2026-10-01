// Keep this synchronous, same-origin script before the app entry so that a saved
// theme is applied before the first paint, including under the production CSP.
(() => {
  const root = document.documentElement;
  let theme = "light";
  let storageWarning = false;
  try {
    const saved = window.localStorage.getItem("x-dde-theme");
    if (saved === "light" || saved === "dark") theme = saved;
  } catch {
    storageWarning = true;
  }
  root.dataset.theme = theme;
  root.dataset.themeReady = "true";
  root.dataset.themeStorageWarning = String(storageWarning);
  const color = getComputedStyle(root).getPropertyValue("--canvas").trim();
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta && color) meta.setAttribute("content", color);
})();
