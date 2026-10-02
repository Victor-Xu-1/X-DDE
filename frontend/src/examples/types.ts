import type { ScientificObject } from "../research/types";
import type { TaskRequest } from "../operations/types";
import type { WorkflowPlanInput } from "../workflows/types";

export interface ExampleInfo {
  module: { capability_id: string; case_id: string; revision: number };
  case: {
    id: string;
    revision: number;
    label: [string, string];
    description: [string, string];
    sources: string[];
    evidence_entities?: Record<
      string,
      { id: string; name: string; description: string }
    >;
  };
  files: { name: string; license: string; sha256: string }[];
  computed_result_available: boolean;
  pin: null | { job_id: string; artifact_sha256: Record<string, string> };
}

export interface PreparedExample {
  module: ExampleInfo["module"];
  case: ExampleInfo["case"];
  objects: Record<string, ScientificObject>;
  sequences: Record<string, string>;
  sequence_sources?: Record<string, string[]>;
  sources: string[];
  request?: TaskRequest | null;
  workflow_plan?: WorkflowPlanInput | null;
}
