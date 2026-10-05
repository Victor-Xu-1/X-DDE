import type { NativeInteraction } from "../integrations/types";
export interface PotentialMap {
  url: string;
  unit: "kBT/e";
  range?: number;
}
export const interactionColors: Record<string, string> = {
  hydrogen_bond: "#399ac9",
  hydrophobic: "#cf9c36",
  salt_bridge: "#db5f74",
  pi_stack: "#9172d5",
  pi_cation: "#b365c0",
  halogen_bond: "#41a88e",
  water_bridge: "#67b9d3",
  metal_complex: "#80919e",
};
export function nativeInteractions(
  value: unknown,
): NativeInteraction[] | undefined {
  if (value === undefined) return undefined;
  if (!Array.isArray(value) || value.length > 1000)
    throw new Error("Invalid native interaction set");
  for (const row of value) {
    if (
      !row ||
      !(row.kind in interactionColors) ||
      typeof row.chain !== "string" ||
      row.chain.length > 8 ||
      !Number.isInteger(row.number) ||
      typeof row.residue !== "string" ||
      row.residue.length > 8 ||
      !Number.isFinite(row.distance) ||
      row.distance < 0 ||
      row.distance > 20 ||
      [row.protein_position, row.ligand_position].some(
        (p) =>
          !Array.isArray(p) ||
          p.length !== 3 ||
          p.some((n) => !Number.isFinite(n) || Math.abs(n) > 100000),
      )
    )
      throw new Error("Invalid native interaction coordinates");
  }
  return value;
}

export function validatePotentialGrid(text: string) {
  const counts = text.match(
    /class gridpositions counts\s+(\d+)\s+(\d+)\s+(\d+)/,
  );
  if (!counts || counts.slice(1).some((n) => Number(n) < 2 || Number(n) > 129))
    throw new Error("Potential grid exceeds the display budget");
  const expected = counts.slice(1).reduce((n, v) => n * Number(v), 1);
  const start = text.match(/items\s+(\d+)\s+data follows\s*\n/);
  if (
    !start ||
    Number(start[1]) !== expected ||
    !text.match(/^origin\s+[-+\d.eE]+\s+[-+\d.eE]+\s+[-+\d.eE]+/m) ||
    (text.match(/^delta\s+/gm)?.length ?? 0) !== 3
  )
    throw new Error("Potential grid has an incomplete coordinate definition");
  const values = text
    .slice(start.index! + start[0].length)
    .split(/\n\s*(?:attribute|object|component)\s/)[0]
    .trim()
    .split(/\s+/);
  if (
    values.length !== expected ||
    values.some((v) => !Number.isFinite(Number(v)))
  )
    throw new Error("Potential grid has missing or invalid values");
  return expected;
}
