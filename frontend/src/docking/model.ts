import type { MoleculeRef } from "../research/types";
import type { DockingMode, DockingTask, SearchBox } from "./types";
export function task(
  mode: DockingMode,
  receptor: MoleculeRef | null,
  ligand: MoleculeRef | null,
  options: Record<string, unknown>,
  reference: MoleculeRef | null,
  box: SearchBox | null,
  confirmed: boolean,
  name: string,
): DockingTask {
  if (!receptor || !ligand)
    throw new Error("Choose a receptor and a molecular version.");
  if (mode === "dock" && !box && !reference)
    throw new Error("Choose a reference pocket ligand or define a search box.");
  if (!confirmed && (mode !== "dock" || reference))
    throw new Error(
      "Confirm that the selected pose/reference uses this receptor coordinate frame.",
    );
  return {
    operation: "docking",
    name,
    mode,
    receptor,
    ligand,
    options,
    search:
      mode !== "dock"
        ? null
        : box
          ? { kind: "box", frame: receptor, box }
          : {
              kind: "reference_ligand",
              frame: receptor,
              reference: reference!,
              coordinate_basis: "user_confirmed",
            },
    pose_frame: mode === "dock" ? null : receptor,
    pose_coordinate_basis: mode === "dock" ? null : "user_confirmed",
  };
}
export function parseBox(center: string[], size: string[]): SearchBox {
  if ([...center, ...size].some((value) => !value.trim()))
    throw new Error("Enter all search-box coordinates and lengths.");
  const c = center.map(Number),
    s = size.map(Number);
  if (
    c.length !== 3 ||
    s.length !== 3 ||
    c.some((v) => !Number.isFinite(v) || Math.abs(v) > 100000) ||
    s.some((v) => !Number.isFinite(v) || v < 4 || v > 100)
  )
    throw new Error(
      "Use finite receptor coordinates and box lengths of 4–100 Å.",
    );
  return {
    center: c as [number, number, number],
    size: s as [number, number, number],
    unit: "angstrom",
  };
}
