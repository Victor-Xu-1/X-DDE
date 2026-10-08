export interface ViewportSize {
  width: number;
  height: number;
}

/** Preserve the focused region and rotation while fitting the limiting viewport axis. */
export function resizeZoomFactor(previous: ViewportSize, next: ViewportSize) {
  if (
    ![previous.width, previous.height, next.width, next.height].every(
      (n) => Number.isFinite(n) && n > 0,
    )
  )
    return 1;
  return (
    Math.min(1, next.width / next.height) /
    Math.min(1, previous.width / previous.height)
  );
}
