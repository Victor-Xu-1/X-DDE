import type { Residue } from "./protocol";

export type ResidueSelectionMode = "replace" | "toggle" | "range";
export interface ResidueSelection {
  keys: string[];
  anchor: string | null;
}
export const emptyResidueSelection = (): ResidueSelection => ({
  keys: [],
  anchor: null,
});

/** Selection uses observed source order, never a manufactured sequence or residue offset. */
export function selectObservedResidues(
  value: unknown,
  residues: Residue[],
  state: ResidueSelection,
): ResidueSelection {
  if (!value || typeof value !== "object")
    throw new Error("Invalid residue selection");
  const { key, mode } = value as { key?: unknown; mode?: unknown };
  const target = residues.find((row) => row.key === key);
  if (
    !target ||
    typeof mode !== "string" ||
    !["replace", "toggle", "range"].includes(mode)
  )
    throw new Error("Residue selection does not match this structure");
  const available = new Set(residues.map((row) => row.key));
  const selected = new Set(state.keys.filter((id) => available.has(id)));
  if (mode === "range") {
    const anchor = residues.find((row) => row.key === state.anchor);
    if (anchor?.chain === target.chain) {
      const chain = residues.filter((row) => row.chain === target.chain);
      const a = chain.findIndex((row) => row.key === anchor.key);
      const b = chain.findIndex((row) => row.key === target.key);
      return {
        keys: chain
          .slice(Math.min(a, b), Math.max(a, b) + 1)
          .map((row) => row.key),
        anchor: anchor.key,
      };
    }
  }
  if (mode === "toggle") {
    if (selected.has(target.key)) selected.delete(target.key);
    else selected.add(target.key);
    return { keys: [...selected], anchor: target.key };
  }
  return { keys: [target.key], anchor: target.key };
}
