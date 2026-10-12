import type { DisplayResidue } from "../viewer/residue-region";

/** Native pocket addresses refer to the first receptor model's author namespace. */
export function referencePocketResidues(value: unknown): DisplayResidue[] {
  if (!Array.isArray(value) || value.length > 2000) return [];
  const unique = new Map<string, DisplayResidue>();
  for (const address of value) {
    if (typeof address !== "string") return [];
    const match = /^([A-Za-z0-9]):(-?\d+)$/.exec(address);
    if (!match || !Number.isSafeInteger(Number(match[2]))) return [];
    unique.set(address, {
      model: 0,
      chain: match[1],
      number: Number(match[2]),
      insertion_code: "",
      alternate_location: "",
    });
  }
  return [...unique.values()];
}
