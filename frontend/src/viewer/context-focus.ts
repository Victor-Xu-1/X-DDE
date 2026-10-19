import type { AtomSelectionSpec, AtomSpec, GLViewer } from "3dmol";
import { viewportFitFactor, type ViewportSize } from "./camera-resize";
import { finiteCoordinates } from "./geometry";

/** Fit nearby real source atoms, retaining enough context around small selections. */
export function focusDisplayContext(
  viewer: GLViewer,
  anchors: AtomSpec[],
  pairedModel: number | null,
  viewport?: ViewportSize,
  explicitModels?: number[],
) {
  const anchorPositions = anchors.flatMap((atom) => {
    const point = finiteCoordinates(atom);
    return point ? [point] : [];
  });
  if (!anchorPositions.length) return false;
  // Keep an explicitly paired ligand complete when focusing one of its contacts.
  const positions = [
    ...anchorPositions,
    ...(pairedModel === null
      ? []
      : viewer.selectedAtoms({ model: pairedModel }).flatMap((atom) => {
          const point = finiteCoordinates(atom);
          return point ? [point] : [];
        })),
  ];
  const lower = [Infinity, Infinity, Infinity],
    upper = [-Infinity, -Infinity, -Infinity];
  for (const point of positions)
    for (let axis = 0; axis < 3; axis++) {
      lower[axis] = Math.min(lower[axis], point[axis] - 8);
      upper[axis] = Math.max(upper[axis], point[axis] + 8);
    }
  const selection: AtomSelectionSpec = {
    // Default to the primary source; another source requires explicit selection
    // or a paired ligand. Focusing comparisons never implies a shared complex.
    model: explicitModels ?? (pairedModel === null ? 0 : [0, pairedModel]),
    predicate: (atom) => {
      const point = finiteCoordinates(atom);
      return Boolean(
        point &&
        point.every(
          (value, axis) => value >= lower[axis] && value <= upper[axis],
        ),
      );
    },
  };
  if (!viewer.selectedAtoms(selection).length) return false;
  viewer.zoomTo(selection);
  viewer.zoom(0.85 * (viewport ? viewportFitFactor(viewport) : 1));
  viewer.render();
  return true;
}
