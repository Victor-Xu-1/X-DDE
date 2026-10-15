import { defaults, models, parameterGroups } from "./generated";
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

export function editableOptionNames(
  mode: DesignMode,
  value: Record<string, unknown>,
) {
  const fields = new Set<string>([
    ...parameterGroups.common,
    ...parameterGroups[mode],
  ]);
  if (mode === "generate" && String(value.model).endsWith("_joint"))
    for (const name of parameterGroups.generate_joint) fields.add(name);
  if (mode === "generate" || mode === "inpaint") {
    const sizing =
      value.size_mode === "sample"
        ? parameterGroups.sample
        : parameterGroups[`fixed_${mode}`];
    for (const name of sizing) fields.add(name);
  }
  return fields;
}

export function editableOptions(
  mode: DesignMode,
  value: Record<string, unknown>,
) {
  const fields = editableOptionNames(mode, value);
  return Object.fromEntries(
    Object.entries(value).filter(([name]) => fields.has(name)),
  );
}

export function optimizationBudgetValid(value: Record<string, unknown>) {
  const { population, rounds, survivors } = value;
  return (
    typeof population === "number" &&
    Number.isInteger(population) &&
    population >= 1 &&
    population <= 100 &&
    typeof rounds === "number" &&
    Number.isInteger(rounds) &&
    rounds >= 1 &&
    rounds <= 20 &&
    typeof survivors === "number" &&
    Number.isInteger(survivors) &&
    survivors >= 1 &&
    survivors <= population &&
    population * rounds <= 100
  );
}
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

export function inpaintSizeValid(
  options: Record<string, unknown>,
  fixedCount: number,
) {
  const added = options.added_atoms;
  if (
    !Number.isInteger(fixedCount) ||
    fixedCount < 1 ||
    fixedCount > 80 ||
    typeof added !== "number" ||
    !Number.isInteger(added) ||
    added < 0 ||
    added > 79
  )
    return false;
  return (
    options.size_mode === "sample" ||
    (options.size_mode === "fixed" &&
      fixedCount + added >= 8 &&
      fixedCount + added <= 80)
  );
}
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
  if (mode === "inpaint" && !inpaintSizeValid(options, fixed.length))
    throw new Error(
      "Fixed and added heavy atoms must total 8–80; adjust the core or added atoms.",
    );
  if (mode === "optimize" && !optimizationBudgetValid(options))
    throw new Error(
      "Use at most 100 optimization attempts and retain no more parents than the population.",
    );
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
