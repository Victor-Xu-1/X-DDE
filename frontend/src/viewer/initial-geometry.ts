import type { AtomSpec } from "3dmol";
import { finiteCoordinates } from "./geometry";

/** Read genuine spatial coordinates; a missing MOL header flag is not proof of 2D. */
export function spatialMolecule(
  atoms: readonly AtomSpec[],
  declared3D: boolean,
): boolean {
  if (declared3D) return true;
  const points = atoms.map(finiteCoordinates);
  if (points.length < 4 || points.some((point) => !point)) return false;
  const origin = points[0]!;
  const vectors = points
    .slice(1)
    .map((point) => point!.map((value, index) => value - origin[index]));
  const first = vectors.find((point) => Math.hypot(...point) > 1e-4);
  if (!first) return false;
  for (const second of vectors) {
    const normal = [
      first[1] * second[2] - first[2] * second[1],
      first[2] * second[0] - first[0] * second[2],
      first[0] * second[1] - first[1] * second[0],
    ];
    const length = Math.hypot(...normal);
    if (length < 1e-6) continue;
    return vectors.some(
      (point) =>
        Math.abs(
          point.reduce((sum, value, index) => sum + value * normal[index], 0),
        ) /
          length >
        1e-4,
    );
  }
  return false;
}
