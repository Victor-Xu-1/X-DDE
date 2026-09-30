import type { AtomSpec, AtomSelectionSpec } from "3dmol";
import type { Residue } from "./protocol";
export const residueRef = (atom: AtomSpec): Residue => ({
  key: `${atom.chain}:${atom.resn}:${atom.resi}:${atom.icode ?? ""}`,
  chain: atom.chain ?? "",
  resn: atom.resn ?? "",
  resi: atom.resi ?? 0,
  icode: atom.icode ?? "",
});
export const residueSelection = (r: Residue): AtomSelectionSpec => ({
  chain: r.chain,
  resn: r.resn,
  resi: r.resi,
  // The CIF parser omits absent insertion codes; filtering by an empty string matches nothing.
  ...(r.icode ? { icode: r.icode } : {}),
});
export function finiteCoordinates(
  atom: AtomSpec,
): [number, number, number] | undefined {
  const coordinates = [atom.x, atom.y, atom.z];
  if (!coordinates.every((v) => typeof v === "number" && Number.isFinite(v)))
    return undefined;
  return coordinates as [number, number, number];
}
export const atomPosition = (atom: AtomSpec) => {
  const coordinates = finiteCoordinates(atom);
  if (!coordinates) throw new Error("Structure atom has no finite coordinates");
  return { x: coordinates[0], y: coordinates[1], z: coordinates[2] };
};

export const scientificSelectionIdentity = (atom: AtomSpec) => ({
  chain: (atom.chain ?? "").trim(),
  number: atom.resi ?? 0,
  insertion_code: (atom.icode ?? "").trim(),
  alternate_location: (atom.altLoc ?? "").trim(),
});
