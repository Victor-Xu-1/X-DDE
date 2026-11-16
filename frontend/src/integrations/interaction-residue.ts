import type { Residue } from "../viewer/protocol";
import type { NativeInteraction } from "./types";

export type ContactResidue = Pick<
  NativeInteraction,
  "chain" | "residue" | "number" | "insertion_code"
>;

export function interactionResidueLabel(row: ContactResidue) {
  return `${row.chain}:${row.residue}${row.number}${row.insertion_code ?? ""}`;
}

/** Older native reports may omit insertion codes. Resolve only a unique source residue. */
export function interactionResidueKey(
  row: ContactResidue,
  residues: readonly Residue[],
): string | null {
  const matches = residues.filter(
    (residue) =>
      residue.chain === row.chain &&
      residue.resn === row.residue &&
      residue.resi === row.number &&
      (row.insertion_code === undefined ||
        residue.icode === row.insertion_code),
  );
  return matches.length === 1 ? matches[0].key : null;
}
