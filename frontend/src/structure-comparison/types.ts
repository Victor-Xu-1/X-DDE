import type { BaseTask } from "../operations/types";
import type { Address, MemberEvidence } from "../receptors/types";
import type { MoleculeRef } from "../research/types";

export interface ChainMapping {
  reference: string;
  moving: string;
}
export interface ComparisonOptions {
  purpose: "conformational_comparison" | "model_validation";
  reference_model: number;
  moving_model: number;
  target_mapping: ChainMapping[];
  partner_mapping: ChainMapping[];
  correspondence: "sequence" | "author_numbering";
  minimum_identity: number;
  minimum_coverage: number;
  minimum_target_pairs: number;
  minimum_partner_pairs: number;
  cpu: number;
  memory_mib: number;
}
export interface ComparisonTask extends BaseTask {
  operation: "structure_compare";
  reference: MoleculeRef;
  moving: MoleculeRef;
  options: ComparisonOptions;
}
export interface Displacement {
  role: "target" | "partner";
  reference: Address;
  moving: Address;
  reference_letter: string;
  moving_letter: string;
  displacement_angstrom: number;
  reference_position: [number, number, number];
  moving_source_position: [number, number, number];
  moving_aligned_position: [number, number, number];
}
export interface ChainCorrespondence {
  role: "target" | "partner";
  reference_chain: string;
  moving_chain: string;
  reference_observed: number;
  moving_observed: number;
  matched: number;
  identical: number;
  identity: number;
  reference_coverage: number;
  moving_coverage: number;
  unmatched_reference: Address[];
  unmatched_moving: Address[];
}
export interface NativeInterface {
  target: ChainMapping;
  partner: ChainMapping;
  state: "evaluated" | "no_reference_interface";
  metrics:
    | (Record<
        | "DockQ"
        | "F1"
        | "fnat"
        | "fnonnat"
        | "iRMSD"
        | "LRMSD"
        | "nat_correct"
        | "nat_total"
        | "nonnat_count"
        | "model_total"
        | "clashes"
        | "len1"
        | "len2",
        number
      > & {
        class1: "receptor" | "ligand";
        class2: "receptor" | "ligand";
        is_het: false;
      })
    | null;
}
export interface ComparisonResult {
  operation: "structure_compare";
  reference: MoleculeRef;
  moving: MoleculeRef;
  options: ComparisonOptions;
  inspections: {
    structure: NonNullable<MemberEvidence["quality"]>;
    polymer: {
      polymer_residues: number;
      modified_residues: (Address & { residue: string; parent: string })[];
    };
  }[];
  chain_correspondence: ChainCorrespondence[];
  geometry: {
    target_rmsd_angstrom: number;
    partner_rmsd_angstrom: number;
    matched_target_ca: number;
    matched_partner_ca: number;
    residue_displacements: Displacement[];
  };
  native_quality: { interfaces: NativeInterface[] };
  artifact_sha256: Record<string, string>;
  derived_references?: Partial<Record<"reference" | "moving", MoleculeRef>>;
}
export const addressLabel = (a: Address) =>
  `${a.chain}:${a.number}${a.insertion_code}`;
export const displacementId = (r: Displacement) =>
  JSON.stringify([r.role, r.reference, r.moving]);
export function validMappings(target: ChainMapping[], partner: ChainMapping[]) {
  if ([target, partner].some((pairs) => pairs.length < 1 || pairs.length > 4))
    return false;
  const all = [...target, ...partner];
  return ["reference", "moving"].every((side) => {
    const values = all.map((pair) => pair[side as keyof ChainMapping]);
    return (
      values.every((value) => /^[^\s\x00-\x1f\x7f]{1,8}$/.test(value)) &&
      new Set(values).size === values.length
    );
  });
}
