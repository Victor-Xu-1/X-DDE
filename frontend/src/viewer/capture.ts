import type { GLViewer } from "3dmol";
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
