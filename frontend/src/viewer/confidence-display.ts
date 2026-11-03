import type { AtomSpec, GLViewer } from "3dmol";
import { residueRef } from "./geometry";
import { confidenceColor } from "./confidence-types";
import type { MappedConfidence } from "./confidence-mapping";
import type { SceneInfo } from "./protocol";

/** Add a display layer to polymer cartoons; ligand elements, chemistry and surfaces stay native. */
export function paintConfidence(
  viewer: GLViewer,
  info: SceneInfo,
  mapped: MappedConfidence,
) {
  const polymers = new Set(info.residues.map((r) => r.key));
  const colors = new Map<string, number[]>();
  for (const atom of viewer.selectedAtoms({ model: 0 })) {
    const score = mapped.atomScores.get(atom.index!);
    if (score === undefined || !polymers.has(residueRef(atom).key)) continue;
    const color = confidenceColor(score),
      indices = colors.get(color) ?? [];
    indices.push(atom.index!);
    colors.set(color, indices);
  }
  for (const [color, index] of colors)
    viewer.addStyle({ model: 0, index }, { cartoon: { color, opacity: 1 } });
}

export function selectedConfidenceTokens(
  mapped: MappedConfidence,
  selected: number[],
  hidden: Set<number>,
) {
  return [
    ...new Set(
      selected
        .filter((i) => !hidden.has(i))
        .map((i) => mapped.atomTokens.get(i))
        .filter((i): i is number => i !== undefined),
    ),
  ];
}

/** Resolve exact atom tokens while deriving a separate polymer-only sequence acknowledgment. */
export function confidenceSelection(
  value: unknown,
  mapped: MappedConfidence,
  atoms: AtomSpec[],
  info: SceneInfo,
  hidden: Set<number>,
) {
  if (!value || typeof value !== "object") return null;
  const { key, tokens } = value as { key?: string; tokens?: number[] };
  if (
    key !== mapped.key ||
    !Array.isArray(tokens) ||
    tokens.length > mapped.tokens.length ||
    tokens.some(
      (i) => !Number.isInteger(i) || i < 0 || i >= mapped.tokens.length,
    )
  )
    return null;
  const requested = new Set(tokens),
    polymers = new Set(info.residues.map((r) => r.key));
  const selected = atoms.filter(
    (atom) =>
      requested.has(mapped.atomTokens.get(atom.index!)!) &&
      !hidden.has(atom.index!),
  );
  return {
    atoms: selected.map((atom) => atom.index!),
    residues: [...new Set(selected.map((atom) => residueRef(atom).key))].filter(
      (key) => polymers.has(key),
    ),
  };
}
