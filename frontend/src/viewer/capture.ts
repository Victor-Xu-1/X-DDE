import type { GLViewer } from "3dmol";
import { figureDimensions, type FigureSettings } from "../publication/settings";
import { contactLabelLayer } from "./contact-labels";
export function captureDimensions(
  width: number,
  height: number,
  scale: number,
  pixelRatio = 1,
) {
  if (
    !Number.isFinite(width) ||
    !Number.isFinite(height) ||
    width <= 0 ||
    height <= 0 ||
    ![1, 2, 3].includes(scale) ||
    !Number.isFinite(pixelRatio) ||
    pixelRatio <= 0
  )
    throw new Error("Invalid image dimensions.");
  const factor = Math.min(
    scale,
    4096 / (width * pixelRatio),
    4096 / (height * pixelRatio),
    Math.sqrt((8 * 1024 ** 2) / (width * height * pixelRatio ** 2)),
  );
  return [
    Math.max(1, Math.floor(width * factor)),
    Math.max(1, Math.floor(height * factor)),
  ] as const;
}
/** Render at the requested physical output size; viewport, camera and annotations are restored. */
export function captureFigure(
  viewer: GLViewer,
  element: HTMLElement,
  settings: FigureSettings,
) {
  const bounds = element.getBoundingClientRect(),
    ratio = viewer.getRenderer().devicePixelRatio;
  if (!Number.isFinite(ratio) || ratio <= 0)
    throw new Error("The native canvas is not ready.");
  const size = figureDimensions(settings, bounds.width / bounds.height);
  const previousWidth = element.style.width,
    previousHeight = element.style.height,
    view = viewer.getView();
  const labels = contactLabelLayer(viewer);
  // Native label textures are sized in CSS pixels; the renderer multiplies them
  // by its actual raster ratio (including its own antialiasing upscale).
  const restore = labels.printFont(
    (settings.fontPt * settings.dpi) / (72 * ratio),
  );
  try {
    element.style.width = size.width / ratio + "px";
    element.style.height = size.height / ratio + "px";
    viewer.setBackgroundColor("white", settings.transparent ? 0 : 1);
    // Container offsetWidth/offsetHeight round fractional CSS dimensions. Use
    // the public native size controls so odd print-pixel dimensions stay exact.
    viewer.setWidth(size.width / ratio);
    viewer.setHeight(size.height / ratio);
    viewer.setView(view);
    labels.layout();
    viewer.render();
    const canvas = viewer.getCanvas();
    if (canvas.width !== size.width || canvas.height !== size.height)
      throw new Error(
        "Native canvas did not reach the requested figure resolution.",
      );
    return viewer.pngURI();
  } finally {
    try {
      restore();
    } finally {
      element.style.width = previousWidth;
      element.style.height = previousHeight;
      const background =
        getComputedStyle(document.documentElement)
          .getPropertyValue("--chart-bg")
          .trim() || "white";
      viewer.setBackgroundColor(background, 1);
      viewer.resize();
      viewer.setView(view);
      labels.layout();
      viewer.render();
    }
  }
}
/** Render genuine geometry at export resolution, then restore the exact view and layout. */
export function captureView(
  viewer: GLViewer,
  element: HTMLElement,
  scale: number,
) {
  const bounds = element.getBoundingClientRect();
  const pixelRatio = viewer.getCanvas().width / bounds.width;
  const [width, height] = captureDimensions(
    bounds.width,
    bounds.height,
    scale,
    pixelRatio,
  );
  const originalWidth = element.style.width,
    originalHeight = element.style.height;
  const view = viewer.getView();
  try {
    element.style.width = width + "px";
    element.style.height = height + "px";
    viewer.resize();
    viewer.setView(view);
    viewer.render();
    return viewer.pngURI();
  } finally {
    element.style.width = originalWidth;
    element.style.height = originalHeight;
    viewer.resize();
    viewer.setView(view);
    viewer.render();
  }
}
