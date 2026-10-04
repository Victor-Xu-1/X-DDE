export interface PreparedEntity {
  label: string;
  kind: string;
  count: number;
  sequence?: string;
  smiles?: string;
  ccd?: string;
}
const object = (value: unknown): Record<string, unknown> =>
  value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
/** Read only declared native entities. CCD identifiers are not SMILES or predicted coordinates. */
export function preparedEntities(value: unknown): PreparedEntity[] {
  const inputs = Array.isArray(value) ? value : [value];
  return inputs.flatMap((input, group) => {
    const entry = object(input);
    const sequences = Array.isArray(entry.sequences) ? entry.sequences : [];
    return sequences.flatMap<PreparedEntity>((raw, index) => {
      const row = object(raw),
        keys = [
          ["proteinChain", "protein"],
          ["dnaSequence", "dna"],
          ["rnaSequence", "rna"],
          ["ligand", "ligand"],
        ];
      const key = keys.find(([name]) => name in row);
      if (!key) return [];
      const content = object(row[key[0]]),
        count = typeof content.count === "number" ? content.count : 1;
      const label =
        (typeof entry.name === "string" ? entry.name : "Input " + (group + 1)) +
        " · " +
        (index + 1);
      if (key[1] !== "ligand")
        return typeof content.sequence === "string"
          ? [{ label, kind: key[1], count, sequence: content.sequence }]
          : [];
      if (typeof content.ligand !== "string") return [];
      if (content.ligand.startsWith("CCD_"))
        return [{ label, kind: "ligand", count, ccd: content.ligand.slice(4) }];
      if (content.ligand.startsWith("SMILES_"))
        return [
          { label, kind: "ligand", count, smiles: content.ligand.slice(7) },
        ];
      return [];
    });
  });
}
