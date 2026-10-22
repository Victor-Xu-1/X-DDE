import type { MoleculeRef } from "../research/types";
import { referenceKey } from "../research/input-catalog";
import type { ScientificTask } from "./types";

export interface BoltzComponent {
  id: string;
  kind: string;
  value: string;
  source?: MoleculeRef | null;
  msa?: MoleculeRef | null;
  msa_mode?: "provided" | "single" | null;
}

export function boltzMsaKey(component: BoltzComponent) {
  return component.msa
    ? JSON.stringify([referenceKey(component.msa), component.value])
    : "";
}

export function boltzMaterialInputs(components: BoltzComponent[]) {
  const result: ScientificTask["inputs"] = [];
  const seen = new Set<string>();
  for (const component of components) {
    for (const [role, source] of [
      ["ligand", component.source],
      ["msa", component.msa],
    ] as const) {
      if (!source) continue;
      const key = role + ":" + referenceKey(source);
      if (seen.has(key)) continue;
      result.push({ role, source });
      seen.add(key);
    }
  }
  return result;
}
