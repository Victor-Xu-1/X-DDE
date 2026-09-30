import type { MoleculeRef } from "../research/types";
import type { IdentityResult } from "../diffsbdd/types";
import { referenceKey } from "../diffsbdd/model";
import { roles } from "./generated";
export type RegionRole = (typeof roles)[number]["id"];
export interface Region {
  name: string;
  role: RegionRole;
  atom_indices: number[];
}
export interface RegionBody {
  name: string;
  subject: MoleculeRef;
  identity_job: string;
  parent_id?: string | null;
  regions: Region[];
}
export interface SavedRegion {
  id: string;
  sha256: string;
  body: RegionBody;
}

export function validIdentity(
  value: unknown,
  subject: MoleculeRef,
): value is IdentityResult {
  if (!value || typeof value !== "object") return false;
  const report = value as Partial<IdentityResult>;
  return (
    report.mode === "identity" &&
    report.complete === true &&
    report.identity_basis === "rdkit_removeHs_record_order" &&
    !!report.reference &&
    referenceKey(report.reference) === referenceKey(subject) &&
    typeof report.molecule_artifact === "string" &&
    /^[a-zA-Z0-9_.-]+\.sdf$/.test(report.molecule_artifact) &&
    Array.isArray(report.atoms) &&
    report.atoms.length > 0 &&
    report.atoms.length <= 5000 &&
    report.atoms.every(
      (atom, index) =>
        !!atom &&
        typeof atom === "object" &&
        atom.index === index &&
        Number.isInteger(atom.index) &&
        typeof atom.element === "string" &&
        /^[A-Z][a-z]?$/.test(atom.element) &&
        typeof atom.selectable === "boolean",
    )
  );
}
export function toggleAtom(regions: Region[], active: number, atom: number) {
  if (!Number.isInteger(atom) || atom < 0 || atom >= 5000 || !regions[active])
    return regions;
  return regions.map((region, index) =>
    index === active
      ? {
          ...region,
          atom_indices: region.atom_indices.includes(atom)
            ? region.atom_indices.filter((value) => value !== atom)
            : [...region.atom_indices, atom].sort((a, b) => a - b),
        }
      : region,
  );
}
export function validateRegions(
  regions: Region[],
  selectable: readonly number[],
) {
  if (!regions.length || regions.length > 20)
    throw new Error("Define 1–20 regions.");
  const names = regions.map((region) => region.name.trim());
  if (
    names.some(
      (name) => !name || name.length > 80 || /[\x00-\x1f]/.test(name),
    ) ||
    new Set(names).size !== names.length
  )
    throw new Error("Give each region a distinct name (1–80 characters).");
  const allowed = new Set(selectable);
  for (const region of regions) {
    if (
      !roles.some((role) => role.id === region.role) ||
      !region.atom_indices.length ||
      new Set(region.atom_indices).size !== region.atom_indices.length ||
      region.atom_indices.some(
        (index) => !Number.isInteger(index) || !allowed.has(index),
      )
    )
      throw new Error(
        "Select valid atoms in every region. Membership may overlap.",
      );
  }
  return regions.map((region, index) => ({ ...region, name: names[index] }));
}
