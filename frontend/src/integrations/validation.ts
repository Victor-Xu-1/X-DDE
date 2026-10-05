import type { ScientificPayload } from "./types";

function bounded(value: unknown, min: number, max: number, integer = false) {
  return (
    typeof value === "number" &&
    Number.isFinite(value) &&
    value >= min &&
    value <= max &&
    (!integer || Number.isInteger(value))
  );
}

function range(value: unknown, min = -Infinity, max = Infinity, equal = false) {
  return (
    Array.isArray(value) &&
    value.length === 2 &&
    value.every((v) => bounded(v, min, max)) &&
    (equal ? value[0] <= value[1] : value[0] < value[1])
  );
}

// Early form guidance; the server remains the scientific input authority.
export function validScientificChoices(p: ScientificPayload): boolean {
  switch (p.kind) {
    case "boltz":
      return (
        bounded(p.samples, 1, 10, true) &&
        bounded(p.recycling_steps, 1, 10, true) &&
        bounded(p.sampling_steps, 20, 500, true)
      );
    case "reinvent":
      return (
        bounded(p.candidates, 1, 500, true) &&
        bounded(p.optimization_steps, 5, 200, true) &&
        range(p.molecular_weight) &&
        range(p.logp)
      );
    case "ligandmpnn":
      return (
        bounded(p.candidates, 1, 100, true) &&
        bounded(p.temperature, Number.MIN_VALUE, 1)
      );
    case "boltzgen":
      return (
        bounded(p.candidates, 1, 200, true) &&
        bounded(p.retain, 1, Number(p.candidates), true) &&
        range(p.length, 8, 300, true) &&
        (p.length as number[]).every(Number.isInteger)
      );
    case "openmm":
      return (
        bounded(p.ph, 2, 12) &&
        bounded(p.iterations, 1, 5000, true) &&
        bounded(p.restraint_kj_mol_nm2, 100, 10000)
      );
    case "apbs":
      return (
        bounded(p.ph, 2, 12) &&
        bounded(p.salt_molar, 0, 1) &&
        bounded(p.temperature_kelvin, 273.15, 330) &&
        [65, 97, 129].includes(Number(p.grid))
      );
    case "chemprop":
      return (
        bounded(p.epochs, 5, 200, true) &&
        /^[A-Za-z][A-Za-z0-9_ .-]{0,63}$/.test(String(p.activity_property)) &&
        typeof p.activity_unit === "string" &&
        p.activity_unit.length > 0 &&
        p.activity_unit.length <= 40
      );
    default:
      return true;
  }
}

export function validBoltzComponents(
  value: unknown,
  affinity: unknown,
): boolean {
  if (!Array.isArray(value) || value.length < 1 || value.length > 8)
    return false;
  const ids = new Set();
  let files = 0,
    ligands = 0,
    proteins = 0;
  for (const item of value) {
    if (
      !item ||
      !/^[A-Za-z][A-Za-z0-9]{0,7}$/.test(item.id) ||
      ids.has(item.id)
    )
      return false;
    ids.add(item.id);
    const alphabet = {
      protein: /^[ACDEFGHIKLMNPQRSTVWYX]+$/,
      rna: /^[ACGU]+$/,
      dna: /^[ACGT]+$/,
    };
    if (item.kind === "ligand") {
      ligands++;
      if (item.source) {
        if (item.value || ++files > 1) return false;
      } else if (
        typeof item.value !== "string" ||
        !item.value ||
        /\s/.test(item.value)
      )
        return false;
    } else {
      if (
        item.source ||
        !(item.kind in alphabet) ||
        !alphabet[item.kind as keyof typeof alphabet].test(item.value)
      )
        return false;
      if (item.kind === "protein") proteins++;
    }
    if (typeof item.value === "string" && item.value.length > 5000)
      return false;
  }
  return !affinity || (ligands === 1 && proteins > 0);
}
