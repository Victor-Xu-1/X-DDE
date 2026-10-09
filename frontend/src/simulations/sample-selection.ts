import type { DynamicsResult } from "./types";

/** Resolve the actual plotted repeat before choosing its nearest saved sample. */
export function sampledSelection(
  replicas: DynamicsResult["replicas"],
  time: number,
  seriesIndex: number,
) {
  const current = replicas[seriesIndex];
  if (!current || !Number.isFinite(time) || !current.frames.length) return null;
  const frame = current.frames.reduce(
    (nearest, value, index) =>
      Math.abs(value.time_ns - time) <
      Math.abs(current.frames[nearest].time_ns - time)
        ? index
        : nearest,
    0,
  );
  return { repeat: seriesIndex, frame };
}
