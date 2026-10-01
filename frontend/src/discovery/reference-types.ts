import type { BaseTask } from "../operations/types";
import type { MoleculeRef } from "../research/types";
export interface ReferenceImportTask extends BaseTask {
  operation: "reference_import";
  source: "pdb" | "chembl";
  identifier: string;
  format: "pdb" | "cif" | "sdf";
  evidence?: MoleculeRef | null;
  activity_id?: number | null;
  allow_external: true;
}
