import { defaults, models } from "./generated";
import type { DesignMode, Pocket, ResidueRef } from "./types";
import type { MoleculeRef } from "../research/types";

export const optionsFor = (
  mode: DesignMode,
  count = 3,
): Record<string, unknown> => ({
  ...structuredClone(defaults),
  task: mode,
  count,
  ...(mode === "inpaint" ? { fragment_policy: "all", relaxation: 0 } : {}),
});
export const compatibleModels = (mode: DesignMode) =>
  models.filter((m) => mode === "generate" || m.strategy === "cond");
export const referenceKey = (ref: MoleculeRef | null) =>
  JSON.stringify(
    ref
      ? [
          ref.asset_id,
          ref.sha256,
          ref.record,
          ref.conformer,
          ref.version_id ?? null,
        ]
      : null,
  );
export function residueFromSelection(
  protein: MoleculeRef,
  chain: string,
  number: number,
): ResidueRef {
  if (!/^[a-zA-Z0-9]$/.test(chain) || !Number.isInteger(number))
    throw new Error("Select a single PDB chain and residue number.");
  return {
    structure: protein,
    model: 0,
    chain,
    number,
    insertion_code: "",
    alternate_location: "",
  };
}
export function parseResidues(
  text: string,
  protein: MoleculeRef,
): ResidueRef[] {
  const refs = text
    .trim()
    .split(/[\s,，]+/)
    .filter(Boolean)
    .map((value) => {
      const match = /^([A-Za-z0-9]):(-?\d+)$/.exec(value);
      if (!match) throw new Error("Use PDB residues such as A:10, A:11.");
      return residueFromSelection(protein, match[1], Number(match[2]));
    });
  if (!refs.length || refs.length > 250)
    throw new Error("Select 1–250 pocket residues.");
  if (new Set(refs.map((r) => `${r.chain}:${r.number}`)).size !== refs.length)
    throw new Error("Pocket selections must not contain duplicate residues.");
  return refs;
}
export function designPayload(
  mode: DesignMode,
  protein: MoleculeRef,
  pocket: Pocket,
  initial: MoleculeRef | null,
  options: Record<string, unknown>,
  fixed: number[],
  savedRegions: string | null = null,
) {
  if (options.task !== mode)
    throw new Error("Design mode and task parameter must agree.");
  if (mode !== "generate" && !initial)
    throw new Error("Choose an aligned 3D starting molecule.");
  if (mode !== "generate" && !String(options.model).endsWith("_cond"))
    throw new Error("This mode requires a conditional model.");
  if (
    mode === "inpaint" &&
    (!fixed.length || new Set(fixed).size !== fixed.length)
  )
    throw new Error("Select fixed atoms on the validated molecular preview.");
  return {
    mode,
    saved_regions: mode === "inpaint" ? savedRegions : null,
    protein,
    pocket,
    initial: mode === "generate" ? null : initial,
    options: {
      ...options,
      fixed_atoms: mode === "inpaint" ? fixed : [],
    } as Record<string, unknown>,
    fixed_atoms:
      mode === "inpaint"
        ? fixed.map((index) => ({ molecule: initial!, index }))
        : [],
  };
}
