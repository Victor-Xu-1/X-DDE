import type { GLViewer, XYZ } from "3dmol";
import { finiteCoordinates } from "./geometry";

const targetOccupancy = 0.78;
const maximumMagnification = 1.9;

/** Center-relative projected extents in CSS pixels. Atom coordinates stay untouched. */
function projectedExtents(viewer: GLViewer, positions: XYZ[]) {
  const bounds = viewer.getCanvas().getBoundingClientRect();
  const cx = bounds.left + bounds.width / 2;
  const cy = bounds.top + bounds.height / 2;
  let horizontal = 0;
  let vertical = 0;
  for (const point of viewer.modelToScreen(positions)) {
    horizontal = Math.max(horizontal, Math.abs(point.x - cx));
    vertical = Math.max(vertical, Math.abs(point.y - cy));
  }
  const occupancy = Math.max(
    (2 * horizontal) / bounds.width,
    (2 * vertical) / bounds.height,
  );
  return Number.isFinite(occupancy) && occupancy > 0
    ? { horizontal, vertical, occupancy }
    : undefined;
}

function displayedPositions(viewer: GLViewer) {
  return viewer.selectedAtoms({ model: 0 }).flatMap((atom) => {
    if (!atom.style || !Object.keys(atom.style).length) return [];
    const point = finiteCoordinates(atom);
    return point ? [{ x: point[0], y: point[1], z: point[2] }] : [];
  });
}

const projectedAspect = ({
  horizontal,
  vertical,
}: {
  horizontal: number;
  vertical: number;
}) => Math.max(1, horizontal) / Math.max(1, vertical);

export function currentLigandAspect(viewer: GLViewer) {
  const footprint = projectedExtents(viewer, displayedPositions(viewer));
  return footprint && projectedAspect(footprint);
}

/** Tighten the native whole-model fit for a single displayed molecular record. */
export function fitStandaloneLigand(viewer: GLViewer) {
  const positions = displayedPositions(viewer);
  if (positions.length < 2) return undefined;
  const footprint = projectedExtents(viewer, positions);
  if (!footprint) return undefined;
  const original = viewer.getView();
  viewer.zoom(
    Math.min(maximumMagnification, targetOccupancy / footprint.occupancy),
  );
  // Perspective can enlarge nearby atoms faster than the estimated scale.
  let adjusted = projectedExtents(viewer, positions);
  if (adjusted && adjusted.occupancy > 0.82) {
    viewer.zoom(targetOccupancy / adjusted.occupancy);
    adjusted = projectedExtents(viewer, positions);
  }
  if (!adjusted || adjusted.occupancy > 0.87) {
    viewer.setView(original);
    return undefined;
  }
  // Avoid a degenerate aspect for projections that are nearly collinear.
  return projectedAspect(adjusted);
}
