import type { TaskRequest } from "../operations/types";
export interface WorkflowStep {
  id: string;
  request: TaskRequest;
  depends_on: string[];
  retries: number;
  retry_backoff_seconds?: number;
  bindings: {
    from_step: string;
    target: "property_input";
    kind: "ligand";
    record: number;
    artifact?: string;
    result_field?: "molecule_artifact";
  }[];
}
export interface WorkflowPlanInput {
  name: string;
  steps: WorkflowStep[];
  budget: { max_jobs: number; wall_seconds: number };
}
export interface WorkflowPlan {
  id: string;
  sha256: string;
  body: WorkflowPlanInput;
  created_at: string;
}
export interface WorkflowRun {
  id: string;
  plan_id: string;
  state: string;
  reason: string | null;
  created_at: string;
  attempts: {
    step_id: string;
    attempt: number;
    job_id: string;
    status: string;
    error: string | null;
  }[];
}
