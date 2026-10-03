import type { AtomSpec, GLViewer } from "3dmol";
import {
  atomPosition,
  finiteCoordinates,
  residueRef,
  residueSelection,
} from "./geometry";
import { residueLabel, type ContactSummary } from "./protocol";
export const contactCutoff = 4;
const displayLimit = 12;
export interface ResidueContact {
  protein: AtomSpec;
  ligand: AtomSpec;
  distance: number;
}
const heavy = (a: AtomSpec) =>
  !["H", "D"].includes(a.elem ?? "") && finiteCoordinates(a);

/** Closest heavy-atom pair per residue. Distances do not assign hydrogen bonds. */
export function residueContacts(
  protein: AtomSpec[],
  ligand: AtomSpec[],
): ResidueContact[] {
  const targets = ligand.filter(heavy);
  if (!targets.length) return [];
  const bounds = (["x", "y", "z"] as const).map((axis) => {
    const values = targets.map((a) => a[axis]!);
    return [
      Math.min(...values) - contactCutoff,
      Math.max(...values) + contactCutoff,
    ];
  });
  const nearest = new Map<string, ResidueContact>();
  for (const atom of protein.filter(heavy)) {
    if (["HOH", "WAT"].includes(atom.resn ?? "")) continue;
    const point = finiteCoordinates(atom)!;
    if (point.some((v, i) => v < bounds[i][0] || v > bounds[i][1])) continue;
    const key = residueRef(atom).key;
    for (const target of targets) {
      const other = finiteCoordinates(target)!;
      const distance = Math.hypot(...point.map((v, i) => v - other[i]));
      if (
        distance <= contactCutoff &&
        distance < (nearest.get(key)?.distance ?? Infinity)
      )
        nearest.set(key, { protein: atom, ligand: target, distance });
    }
  }
  return [...nearest.values()].sort(
    (a, b) =>
      a.distance - b.distance ||
      residueRef(a.protein).key.localeCompare(residueRef(b.protein).key),
  );
}

/** Draw bounded dashed cylinders so contact lines remain visible in WebGL. */
export function paintContacts(
  viewer: GLViewer,
  contacts: ResidueContact[],
  labels: boolean,
  proteinModel = 0,
): ContactSummary {
  const visible = contacts.slice(0, displayLimit);
  for (const contact of visible) {
    const start = atomPosition(contact.ligand),
      end = atomPosition(contact.protein);
    const color = contact.distance < 1.5 ? "#c65b55" : "#349ab4";
    viewer.addStyle(
      { model: proteinModel, ...residueSelection(residueRef(contact.protein)) },
      { stick: { radius: 0.075, colorscheme: "grayCarbon" } },
    );
    if (contact.distance > 0) {
      const segments = Math.max(1, Math.ceil(contact.distance / 0.45));
      for (let i = 0; i < segments; i++) {
        const point = (fraction: number) => ({
          x: start.x + (end.x - start.x) * fraction,
          y: start.y + (end.y - start.y) * fraction,
          z: start.z + (end.z - start.z) * fraction,
        });
        viewer.addCylinder({
          start: point(i / segments),
          end: point((i + 0.55) / segments),
          radius: 0.035,
          color,
          fromCap: 2,
          toCap: 2,
        });
      }
    }
    if (labels)
      viewer.addLabel(
        `${residueLabel(residueRef(contact.protein))} · ${contact.distance.toFixed(2)} Å`,
        {
          position: end,
          fontSize: 11,
          fontColor: color,
          backgroundColor: "white",
          backgroundOpacity: 0.8,
          showBackground: true,
          inFront: true,
        },
      );
  }
  return {
    cutoff: contactCutoff,
    total: contacts.length,
    shown: visible.length,
  };
}
