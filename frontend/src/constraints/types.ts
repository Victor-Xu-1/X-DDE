import type { MoleculeRef } from "../research/types";
import type { SearchBox } from "../docking/types";
export interface ConstraintReference {
  id: string;
  sha256: string;
}
interface ConditionBase {
  id: string;
  label: string;
  strength: "hard" | "soft";
  weight: number | null;
  scope: "subject" | "target_a" | "target_b" | "assembly";
  source: string;
}
export type Condition = ConditionBase &
  (
    | {
        kind: "fixed_region";
        phase: "sampling";
        region_id: string;
        region_name: string;
        validator: "exact_native_indices";
      }
    | {
        kind: "search_box";
        phase: "input";
        box: SearchBox;
        validator: "exact_native_search_box";
      }
  );
export interface ConstraintSet {
  schema_version: 1;
  name: string;
  subject: MoleculeRef;
  frame: {
    reference: MoleculeRef;
    basis: "reference_coordinates" | "user_confirmed_alignment";
    unit: "angstrom";
  } | null;
  parent_id: string | null;
  conditions: Condition[];
}
export interface SavedConstraints extends ConstraintReference {
  body: ConstraintSet;
}
export interface Support {
  executable: boolean;
  document: ConstraintSet;
  conditions: {
    condition_id: string;
    support: string;
    phase: string;
    supported: boolean;
    reason_code: string;
    reason: string;
    independent_result_check: string;
  }[];
}
