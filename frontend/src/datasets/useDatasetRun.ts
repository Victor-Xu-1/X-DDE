import { useRef, useState } from "react";
import { api } from "../api";
import type { Job } from "../types";
import type {
  WorkflowPlan,
  WorkflowPlanInput,
  WorkflowRun,
} from "../workflows/types";
import type { DatasetTask } from "./types";

export type DatasetExecution =
  | { id: string; kind: "job"; job: Job }
  | { id: string; kind: "workflow"; run: WorkflowRun };
export function useDatasetRun(onCreated: (job: Job) => void) {
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    intent = useRef({
      body: "",
      planKey: crypto.randomUUID(),
      runKey: crypto.randomUUID(),
    });
  async function submit(
    value: DatasetTask | WorkflowPlanInput,
  ): Promise<DatasetExecution | undefined> {
    if (busy) return;
    const body = JSON.stringify(value);
    if (body !== intent.current.body)
      intent.current = {
        body,
        planKey: crypto.randomUUID(),
        runKey: crypto.randomUUID(),
      };
    setBusy(true);
    setError("");
    try {
      if ("steps" in value) {
        const plan = await api.post<WorkflowPlan>(
          "/workflows/plans",
          value,
          intent.current.planKey,
        );
        const run = await api.post<WorkflowRun>(
          `/workflows/plans/${plan.id}/runs`,
          { plan_sha256: plan.sha256 },
          intent.current.runKey,
        );
        return { id: run.id, kind: "workflow", run };
      }
      const job = await api.submit(value, intent.current.planKey);
      onCreated(job);
      return { id: job.id, kind: "job", job };
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }
  return { submit, busy, error };
}
