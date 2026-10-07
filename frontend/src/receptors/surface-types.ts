import type { BaseTask } from "../operations/types";
import type { MoleculeRef } from "../research/types";
export interface SurfaceRegion {
  chain: string;
  number: number;
  insertion_code: string;
  resname: string;
}
export interface SurfaceOptions {
  model_index: number;
  context_chains: string[];
  probe_radius_angstrom: number;
  sphere_points: 480 | 960 | 1920;
  cpu: 1;
  memory_mib: number;
}
export const surfaceDefaults: SurfaceOptions = {
  model_index: 0,
  context_chains: [],
  probe_radius_angstrom: 1.4,
  sphere_points: 960,
  cpu: 1,
  memory_mib: 2048,
};
export interface SurfaceExposureTask extends BaseTask {
  operation: "surface_exposure";
  structure: MoleculeRef;
  regions: SurfaceRegion[];
  options: SurfaceOptions;
}
export interface SurfaceRow extends SurfaceRegion {
  isolated_area: number;
  assembly_area: number;
  buried_area: number;
}
export interface SurfaceResult {
  operation: "surface_exposure";
  source: MoleculeRef;
  regions: SurfaceRegion[];
  options: SurfaceOptions;
  residues: (SurfaceRow & { atom_count: number })[];
  atoms: (SurfaceRow & { atom: string; element: string })[];
  isolated_area: number;
  assembly_area: number;
  buried_area: number;
  preview_artifact: string;
  artifacts: Record<string, string>;
}
export const surfaceKey = (r: SurfaceRegion) =>
  JSON.stringify([r.chain, r.number, r.insertion_code, r.resname]);
export const surfaceLabel = (r: SurfaceRegion) =>
  `${r.chain}:${r.resname} ${r.number}${r.insertion_code}`;
