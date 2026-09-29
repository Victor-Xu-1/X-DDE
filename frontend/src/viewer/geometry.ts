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
export const atomPosition = (atom: AtomSpec) => ({
  x: atom.x ?? 0,
  y: atom.y ?? 0,
  z: atom.z ?? 0,
});
