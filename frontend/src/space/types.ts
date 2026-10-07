import type { BaseTask } from "../operations/types";
import type { MoleculeRef } from "../research/types";
import type { SurfaceRegion } from "../receptors/surface-types";
import type { StructurePrepareResult } from "../receptors/preparation-types";
export interface ChannelOptions {
  model_index: number;
  context_chains: string[];
  remove_starting_ligands: boolean;
  alternate: string;
  probe_radius_angstrom: number;
  shell_radius_angstrom: number;
  shell_depth_angstrom: number;
  maximum_start_displacement_angstrom: number;
  profile_step_angstrom: 0.25 | 0.5 | 1;
  maximum_candidates: number;
  cpu: 1 | 2;
  memory_mib: number;
  timeout_seconds: number;
}
export interface ChannelTask extends BaseTask {
  operation: "channel_analysis";
  structure: MoleculeRef;
  starting_regions: SurfaceRegion[];
  options: ChannelOptions;
}
export interface ChannelPoint {
  position: [number, number, number];
  radius_angstrom: number;
  sample_polyline_distance_angstrom: number;
  native_profile_distance_angstrom: number;
  distance_from_start_angstrom: number;
  radius_error_bound_angstrom: number | null;
}
export interface Channel {
  cluster: number;
  tunnel: number;
  bottleneck_radius_angstrom: number;
  length_angstrom: number;
  curvature: number;
  points: ChannelPoint[];
  native_geometric_throughput: number;
  native_geometric_cost: number;
}
export interface ChannelResult {
  operation: "channel_analysis";
  structure: MoleculeRef;
  starting_regions: SurfaceRegion[];
  options: ChannelOptions;
  preparation: StructurePrepareResult;
  prepared_reference?: MoleculeRef;
  channels: Channel[];
  requested_start: [number, number, number];
  native_start_displacement_angstrom: number;
  outcome: "paths_found" | "not_found_within_declared_conditions";
  context: {
    quality: { backbone_complete: boolean; sidechain_completeness: string };
  };
  versions: Record<string, string>;
}
