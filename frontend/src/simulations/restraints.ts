import type { MoleculeRef } from "../research/types";
import type { SelectionInfo } from "../viewer/protocol";

export interface RestraintAtom {
  role: "structure" | "ligand";
  source: MoleculeRef;
  chain: string;
  number: number | null;
  insertion: string;
  atom: string;
  index: number | null;
  position_angstrom: [number, number, number];
}
export type SimulationRestraint =
  | { kind: "position"; atom: RestraintAtom; force_kj_mol_nm2: number }
  | {
      kind: "distance";
      first: RestraintAtom;
      second: RestraintAtom;
      distance_angstrom: number;
      force_kj_mol_nm2: number;
    };

export function pickedAtom(
  selection: SelectionInfo | null,
  role: RestraintAtom["role"],
  source: MoleculeRef,
): RestraintAtom | null {
  if (
    !selection ||
    selection.pick_mode === "distance" ||
    selection.count !== 1 ||
    ["H", "D"].includes(selection.element) ||
    !selection.position?.every(Number.isFinite)
  )
    return null;
  const identity = selection.identity;
  if (
    role === "structure" &&
    (!identity ||
      !Number.isInteger(identity.number) ||
      !selection.atom ||
      !["", "A"].includes(identity.alternate_location))
  )
    return null;
  if (
    role === "ligand" &&
    (!Number.isInteger(selection.source_atom_index) ||
      selection.source_atom_index! < 0)
  )
    return null;
  return {
    role,
    source,
    chain: role === "structure" ? identity!.chain : "",
    number: role === "structure" ? identity!.number : null,
    insertion: role === "structure" ? identity!.insertion_code : "",
    atom: role === "structure" ? selection.atom : "",
    index: role === "ligand" ? selection.source_atom_index! : null,
    position_angstrom: [...selection.position!] as [number, number, number],
  };
}
export function atomLabel(atom: RestraintAtom) {
  return atom.role === "ligand"
    ? `Ligand · ${(atom.index ?? 0) + 1}`
    : `${atom.chain || "—"}:${atom.number}${atom.insertion} · ${atom.atom}`;
}
export const atomKey = (atom: RestraintAtom) =>
  JSON.stringify({ ...atom, position_angstrom: undefined });
export function restraintKey(restraint: SimulationRestraint) {
  return restraint.kind === "position"
    ? "position:" + atomKey(restraint.atom)
    : "distance:" +
        [atomKey(restraint.first), atomKey(restraint.second)].sort().join("|");
}
