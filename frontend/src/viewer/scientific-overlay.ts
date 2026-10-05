import * as mol from "3dmol";
import type { NativeInteraction } from "../integrations/types";

export interface PotentialMap {
  url: string;
  unit: "kBT/e";
  range?: number;
}
const colors: Record<string, string> = {
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
      !(row.kind in colors) ||
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
export function paintNativeContacts(
  viewer: mol.GLViewer,
  rows: NativeInteraction[],
  limit: 3 | 5 | "all",
  labels: boolean,
) {
  const atoms = viewer.selectedAtoms({ model: 0 });
  const keys = [
    ...new Set(
      [...rows]
        .sort((a, b) => a.distance - b.distance)
        .map((r) => `${r.chain}:${r.number}:${r.residue}`),
    ),
  ].slice(0, limit === "all" ? 60 : limit);
  for (const row of rows.filter((r) =>
    keys.includes(`${r.chain}:${r.number}:${r.residue}`),
  )) {
    const residue = atoms.filter(
      (a) =>
        a.chain === row.chain &&
        a.resi === row.number &&
        a.resn === row.residue,
    );
    if (
      !residue.length ||
      !residue.some(
        (a) =>
          Math.hypot(
            (a.x ?? Infinity) - row.protein_position[0],
            (a.y ?? Infinity) - row.protein_position[1],
            (a.z ?? Infinity) - row.protein_position[2],
          ) < 4,
      )
    )
      throw new Error(
        "Native contacts do not match the displayed structural frame",
      );
    const [start, end] = [row.protein_position, row.ligand_position].map(
      (p) => ({ x: p[0], y: p[1], z: p[2] }),
    );
    viewer.addStyle(
      { model: 0, index: residue.map((a) => a.index!) },
      { stick: { radius: 0.09, colorscheme: "Jmol" } },
    );
    viewer.addLine({
      start,
      end,
      color: colors[row.kind],
      dashed: true,
      linewidth: 2,
    });
    if (labels)
      viewer.addLabel(
        `${row.chain}:${row.residue}${row.number} · ${row.distance.toFixed(2)} Å`,
        {
          position: start,
          fontSize: 12,
          fontColor: "#324c62",
          backgroundColor: "white",
          backgroundOpacity: 0.8,
        },
      );
  }
}
export function potentialData(text: string) {
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
  const volume = new mol.VolumeData(text, "dx", { normalize: false });
  if (
    volume.data.length !== expected ||
    volume.data.some((v) => !Number.isFinite(v))
  )
    throw new Error("Potential grid has missing or invalid values");
  return volume;
}
