export interface ViewportSize {
  width: number;
  height: number;
}

/** Fit the limiting axis for the content's centered projected footprint. */
export function viewportFitFactor(viewport: ViewportSize, contentAspect = 1) {
  return [viewport.width, viewport.height, contentAspect].every(
    (n) => Number.isFinite(n) && n > 0,
  )
    ? Math.min(1, viewport.width / viewport.height / contentAspect)
    : 1;
}

/** Preserve the focused region and rotation while fitting the limiting viewport axis. */
export function resizeZoomFactor(
  previous: ViewportSize,
  next: ViewportSize,
  contentAspect = 1,
) {
  if (
    ![previous.width, previous.height, next.width, next.height].every(
      (n) => Number.isFinite(n) && n > 0,
    )
  )
    return 1;
  return (
    viewportFitFactor(next, contentAspect) /
    viewportFitFactor(previous, contentAspect)
  );
}
