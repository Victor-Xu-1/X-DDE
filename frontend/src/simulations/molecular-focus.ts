import type { Loci } from "molstar/lib/mol-model/loci";
import type { CameraFocusLociOptions } from "molstar/lib/mol-plugin-state/manager/camera";
import type { Camera } from "molstar/lib/mol-canvas3d/camera";

/** Native camera orientation is a visual heuristic; source models/coordinates are untouched. */
export const bindingFocusOptions: Partial<CameraFocusLociOptions> = {
  optimizeDirection: true,
  optimizeDirectionUp: "current",
  minRadius: 8,
  extraRadius: 4,
  durationMs: 0,
};

/** Keep the close camera framing, but use the scene depth rather than a ligand-sized slab. */
export function bindingDepth(snapshot: Camera.Snapshot, sceneRadius: number) {
  return {
    ...snapshot,
    radius: Math.max(
      snapshot.radius,
      Math.min(sceneRadius, snapshot.radiusMax),
    ),
    clipFar: false,
  };
}

export function selectedLigandFocus<T extends Loci>(
  loci: readonly T[],
  selection: "all" | "a" | "b",
): T[] {
  if (selection === "all") return [...loci];
  const selected = loci[selection === "b" ? 1 : 0];
  return selected ? [selected] : [];
}
