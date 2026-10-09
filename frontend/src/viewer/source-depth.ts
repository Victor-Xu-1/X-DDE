import type { GLViewer } from "3dmol";
import { finiteCoordinates } from "./geometry";

/** A focused region changes the rotation center, so a global half-extent slab can cut its context. */
export function retainSourceDepth(
  viewer: Pick<GLViewer, "getView" | "getSlab" | "setSlab" | "selectedAtoms">,
) {
  const view = viewer.getView();
  if (view.length < 3 || !view.slice(0, 3).every(Number.isFinite)) return false;
  let radius = 0,
    found = false;
  for (const atom of viewer.selectedAtoms({})) {
    const point = finiteCoordinates(atom);
    if (!point) continue;
    found = true;
    // Public getView() stores the model translation: the focus center is its negative.
    radius = Math.max(
      radius,
      Math.hypot(...point.map((value, axis) => value + view[axis])),
    );
  }
  if (!found) return false;
  const depth = Math.max(50, radius + 4),
    current = viewer.getSlab();
  const near = Math.min(current.near, -depth),
    far = Math.max(current.far, depth);
  if (near === current.near && far === current.far) return false;
  viewer.setSlab(near, far);
  return true;
}
