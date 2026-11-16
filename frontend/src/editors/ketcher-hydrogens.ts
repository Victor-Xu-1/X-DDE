import type { Ketcher } from "./ketcher-contract";

/** Native Indigo folding acts on a display copy; originals remain immutable assets. */
export async function foldDisplayHydrogens(
  editor: Ketcher,
  structure: string,
  preserveCanvasLayout = false,
) {
  const service = editor.structService;
  if (
    !service?.toggleExplicitHydrogens ||
    (!preserveCanvasLayout && !service.layout)
  )
    throw new Error(
      "Update Ketcher to apply the shared hydrogen display rule.",
    );
  // Raw SMILES have no wedge coordinates. Native layout must establish them
  // before folding/export, otherwise absolute stereocenters can be lost.
  // In-canvas edits already carry coordinates and retain the user's layout.
  const arranged = preserveCanvasLayout
    ? structure
    : (
        await service.layout!({
          struct: structure,
          output_format: "chemical/x-indigo-ket",
        })
      ).struct;
  // Standalone builds can toggle an already-folded graph back to explicit H.
  // Inspect actual connectivity first; a skeletal molecule needs no folding.
  if (!hasNonDonorHydrogens(arranged)) return arranged;
  const value = await service.toggleExplicitHydrogens({
    struct: arranged,
    mode: "fold",
    output_format: "chemical/x-indigo-ket",
  });
  if (!value.struct?.trim() || value.struct.length > 5 * 1024 ** 2)
    throw new Error(
      "The native hydrogen display copy is unavailable or too large.",
    );
  if (hasNonDonorHydrogens(value.struct))
    throw new Error(
      "The native drawing component could not hide non-donor hydrogens.",
    );
  return value.struct;
}

/** Inspect native KET connectivity; never guess donor status from coordinates. */
export function hasNonDonorHydrogens(ket: string) {
  const value = JSON.parse(ket) as Record<string, unknown>;
  const hydrogens = new Set(["H", "D", "T"]),
    donors = new Set(["N", "O", "S"]);
  return Object.values(value).some((node) => {
    if (!node || typeof node !== "object") return false;
    const molecule = node as {
      type?: string;
      atoms?: { label?: string }[];
      bonds?: { atoms: number[] }[];
    };
    if (molecule.type !== "molecule" || !Array.isArray(molecule.atoms))
      return false;
    const atoms = molecule.atoms;
    return atoms.some(
      (atom, index) =>
        hydrogens.has(atom.label ?? "") &&
        !(molecule.bonds ?? []).some(
          (bond) =>
            bond.atoms.includes(index) &&
            bond.atoms.some(
              (neighbor) =>
                neighbor !== index && donors.has(atoms[neighbor]?.label ?? ""),
            ),
        ),
    );
  });
}
