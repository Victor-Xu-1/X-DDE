import type { Ketcher } from "./scientificEditor";

/** Native Indigo folding acts on a display copy; originals remain immutable assets. */
export async function foldDisplayHydrogens(editor: Ketcher, structure: string) {
  if (!editor.structService?.toggleExplicitHydrogens)
    throw new Error(
      "Update Ketcher to apply the shared hydrogen display rule.",
    );
  const value = await editor.structService.toggleExplicitHydrogens({
    struct: structure,
    mode: "fold",
    output_format: "chemical/x-indigo-ket",
  });
  if (!value.struct?.trim() || value.struct.length > 5 * 1024 ** 2)
    throw new Error(
      "The native hydrogen display copy is unavailable or too large.",
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

/** Enforce pasted/added explicit-H display too, with one serialized native operation. */
export function observeHydrogenDisplay(
  editor: Ketcher,
  signal: AbortSignal,
  onError: (error: unknown) => void,
) {
  if (!editor.changeEvent || !editor.getKet)
    throw new Error("Update Ketcher to apply hydrogen display after edits.");
  let working = false,
    ownChange = false,
    pending = false;
  const changed = () => {
    if (ownChange || signal.aborted) return;
    if (working) {
      pending = true;
      return;
    }
    working = true;
    pending = false;
    void (async () => {
      const original = await editor.getKet!();
      if (!hasNonDonorHydrogens(original)) return;
      const display = await foldDisplayHydrogens(editor, original);
      signal.throwIfAborted();
      if (original !== (await editor.getKet!())) return;
      ownChange = true;
      try {
        await editor.setMolecule(display);
      } finally {
        ownChange = false;
      }
    })()
      .catch((error) => {
        if (!signal.aborted) onError(error);
      })
      .finally(() => {
        working = false;
        if (pending && !signal.aborted) changed();
      });
  };
  editor.changeEvent.add(changed);
  signal.addEventListener("abort", () => editor.changeEvent!.remove(changed), {
    once: true,
  });
  changed();
}
