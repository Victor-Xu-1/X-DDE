import type { ScientificObject } from "../research/types";
import type { TaskRequest } from "../operations/types";
import type { WorkflowPlanInput } from "../workflows/types";
import type { WorkflowPlan, WorkflowRun } from "../workflows/types";
import type { SavedRegion } from "../regions/model";
import type { Exploration, PoseSet } from "../poses/types";
import type { SiteSet } from "../sites/types";
import type { Plan, DesignDraft } from "../operations/campaign-model";

export interface RecordPin {
  record_id: string;
  record_sha256: string;
  computed_result_available: boolean;
}
export type ExampleRecord =
  | { kind: "regions"; value: SavedRegion; pin: RecordPin }
  | { kind: "workflows"; value: WorkflowPlan; run: WorkflowRun; pin: RecordPin }
  | {
      kind: "pose_exploration";
      value: Exploration;
      sites: SiteSet;
      run: WorkflowRun;
      poses: PoseSet[];
      pin: RecordPin;
    }
  | { kind: "campaign"; value: Plan; pin: RecordPin };

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
  record_pin?: RecordPin | null;
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
  record?: ExampleRecord | null;
  result_requested?: boolean;
  campaign_draft?: DesignDraft | null;
}
