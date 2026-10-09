import type { AtomSpec, GLModel } from "3dmol";

/** Display explicit donor hydrogens only; never delete or generate molecular atoms. */
export function nonExchangeableHydrogens(atoms: AtomSpec[]): number[] {
  const byIndex = new Map(atoms.map((atom) => [atom.index, atom]));
  const hydrogens = new Set(["H", "D", "T"]),
    donors = new Set(["N", "O", "S"]);
  return atoms
    .filter(
      (atom) =>
        hydrogens.has((atom.elem ?? "").toUpperCase()) &&
        !(atom.bonds ?? []).some((index) => {
          const neighbor = byIndex.get(index);
          return neighbor && donors.has((neighbor.elem ?? "").toUpperCase());
        }),
    )
    .flatMap((atom) => (Number.isInteger(atom.index) ? [atom.index!] : []));
}

export function hideNonExchangeableHydrogens(model: GLModel) {
  const indices = nonExchangeableHydrogens(model.selectedAtoms({}));
  if (indices.length) model.setStyle({ index: indices }, {});
}
