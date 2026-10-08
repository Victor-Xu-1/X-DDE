export type ViewMode = "cartoon" | "pocket" | "surface";
export type ContactLimit = 3 | 5 | "all";
export type PickMode = "residue" | "atom" | "distance";
export interface ViewerOptions {
  mode: ViewMode;
  radius: number;
  labels: boolean;
  ligand: string;
  pick: PickMode;
  interactions: boolean;
  contactLimit: ContactLimit;
}
export const defaultOptions: ViewerOptions = {
  mode: "cartoon",
  radius: 5,
  labels: true,
  ligand: "",
  pick: "residue",
  interactions: true,
  contactLimit: 5,
};
export interface Residue {
  key: string;
  chain: string;
  resn: string;
  resi: number;
  icode: string;
}
export interface SceneInfo {
  chains: string[];
  ligands: Residue[];
  residues: Residue[];
  atoms: number;
  hasPolymer: boolean;
  hasInteractionContext?: boolean;
}
export interface ContactSummary {
  cutoff: number;
  total: number;
  shown: number;
  residues: { label: string; distance: number; tooClose: boolean }[];
}
export const surfaceChargeRange = 0.6;
export interface SurfaceSummary {
  total: number;
  input: number;
  estimated: number;
  missing: number;
}
export function surfaceSummary(value: unknown): SurfaceSummary | null {
  if (!value || typeof value !== "object") return null;
  const summary = value as SurfaceSummary;
  const counts = [
    summary.total,
    summary.input,
    summary.estimated,
    summary.missing,
  ];
  return counts.every((n) => Number.isSafeInteger(n) && n >= 0) &&
    summary.total > 0 &&
    summary.input + summary.estimated + summary.missing === summary.total
    ? summary
    : null;
}
export interface SelectionInfo {
  pick_mode?: PickMode;
  identity?: {
    chain: string;
    number: number;
    insertion_code: string;
    alternate_location: string;
    is_ligand?: boolean;
  };
  source_atom_index?: number;
  position?: [number, number, number];
  chain: string;
  residue: string;
  atom: string;
  element: string;
  count: number;
}
export const emptyScene: SceneInfo = {
  chains: [],
  ligands: [],
  residues: [],
  atoms: 0,
  hasPolymer: false,
};
export const residueLabel = (r: Residue) =>
  `${r.chain.trim()}:${r.resn}${r.resi}${r.icode.trim()}`;
export const validSource = (raw: string, origin: string) => {
  const url = new URL(raw, origin);
  if (
    url.origin !== origin ||
    !(
      /^\/api\/assets\/[0-9a-f-]+$/.test(url.pathname) ||
      /^\/api\/jobs\/[0-9a-f-]+\/download$/.test(url.pathname) ||
      /^\/api\/datasets\/[0-9a-f-]+\/members\/structure$/.test(url.pathname) ||
      /^\/api\/harness\/campaigns\/[A-Za-z0-9._-]+\/structure$/.test(
        url.pathname,
      )
    )
  )
    throw new Error("Unsupported structure source");
  return url;
};
