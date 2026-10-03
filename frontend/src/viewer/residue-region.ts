import type { AtomSpec } from "3dmol";
import { scientificSelectionIdentity } from "./geometry";
export interface DisplayResidue {
  model: number;
  chain: string;
  number: number;
  insertion_code: string;
  alternate_location: string;
}
const key = (r: DisplayResidue) =>
  JSON.stringify([
    r.model,
    r.chain,
    r.number,
    r.insertion_code,
    r.alternate_location,
  ]);
export function residueRegion(value: unknown, atoms: AtomSpec[]) {
  if (!Array.isArray(value) || value.length > 2000)
    throw new Error("Invalid residue region");
  const requested: DisplayResidue[] = value.map((v) => {
    if (
      !v ||
      typeof v !== "object" ||
      !Number.isInteger(v.model) ||
      v.model < 0 ||
      !Number.isInteger(v.number) ||
      ![v.chain, v.insertion_code, v.alternate_location].every(
        (s) => typeof s === "string" && s.length <= 16,
      )
    )
      throw new Error("Invalid residue identity");
    return {
      model: v.model,
      chain: v.chain,
      number: v.number,
      insertion_code: v.insertion_code,
      alternate_location: v.alternate_location,
    };
  });
  const keys = new Set(requested.map(key)),
    matched = new Set<string>();
  const indices = atoms.flatMap((atom) => {
    const identity = { model: 0, ...scientificSelectionIdentity(atom) },
      id = key(identity);
    if (!keys.has(id) || !Number.isInteger(atom.index)) return [];
    matched.add(id);
    return [atom.index!];
  });
  return {
    indices: [...new Set(indices)],
    requested: keys.size,
    matched: matched.size,
  };
}
