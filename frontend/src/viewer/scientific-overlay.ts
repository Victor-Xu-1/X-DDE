import { interactionColors, validatePotentialGrid } from "./scientific-data";
import * as mol from "3dmol";
import type { NativeInteraction } from "../integrations/types";

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
    const bridge = row.bridge_position
      ? {
          x: row.bridge_position[0],
          y: row.bridge_position[1],
          z: row.bridge_position[2],
        }
      : null;
    for (const [a, b] of bridge
      ? [
          [start, bridge],
          [bridge, end],
        ]
      : [[start, end]])
      viewer.addLine({
        start: a,
        end: b,
        color: interactionColors[row.kind],
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
  const expected = validatePotentialGrid(text);
  const volume = new mol.VolumeData(text, "dx", { normalize: false });
  if (
    volume.data.length !== expected ||
    volume.data.some((v) => !Number.isFinite(v))
  )
    throw new Error("Potential grid has missing or invalid values");
  return volume;
}
