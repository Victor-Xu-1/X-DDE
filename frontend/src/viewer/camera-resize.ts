export interface ViewportSize {
  width: number;
  height: number;
}

/** 3Dmol's zoomTo fits the vertical field of view; portrait stages also need width. */
export function viewportFitFactor(viewport: ViewportSize) {
  return [viewport.width, viewport.height].every(
    (n) => Number.isFinite(n) && n > 0,
  )
    ? Math.min(1, viewport.width / viewport.height)
    : 1;
}

/** Preserve the focused region and rotation while fitting the limiting viewport axis. */
export function resizeZoomFactor(previous: ViewportSize, next: ViewportSize) {
  if (
    ![previous.width, previous.height, next.width, next.height].every(
      (n) => Number.isFinite(n) && n > 0,
    )
  )
    return 1;
  return viewportFitFactor(next) / viewportFitFactor(previous);
}
