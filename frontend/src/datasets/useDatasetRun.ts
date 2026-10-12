import { useEffect, useRef, useState } from "react";
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
interface DatasetIntent {
  body: string;
  planKey: string;
  runKey: string;
  accepted?: DatasetExecution;
}
export function useDatasetRun(onCreated: (job: Job) => void) {
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const intent = useRef<DatasetIntent>({
      body: "",
      planKey: crypto.randomUUID(),
      runKey: crypto.randomUUID(),
    }),
    pending = useRef(false),
    mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  async function submit(
    value: DatasetTask | WorkflowPlanInput,
  ): Promise<DatasetExecution | undefined> {
    if (pending.current || !mounted.current) return;
    const body = JSON.stringify(value);
    if (body !== intent.current.body)
      intent.current = {
        body,
        planKey: crypto.randomUUID(),
        runKey: crypto.randomUUID(),
      };
    const current = intent.current,
      snapshot = JSON.parse(body) as DatasetTask | WorkflowPlanInput;
    pending.current = true;
    setBusy(true);
    setError("");
    try {
      if (!current.accepted) {
        if ("steps" in snapshot) {
          const plan = await api.post<WorkflowPlan>(
            "/workflows/plans",
            snapshot,
            current.planKey,
          );
          const run = await api.post<WorkflowRun>(
            `/workflows/plans/${plan.id}/runs`,
            { plan_sha256: plan.sha256 },
            current.runKey,
          );
          current.accepted = { id: run.id, kind: "workflow", run };
        } else {
          const job = await api.submit(snapshot, current.planKey);
          current.accepted = { id: job.id, kind: "job", job };
        }
      }
      // Acceptance belongs to the server; only the view callback is disposable.
      const execution = current.accepted;
      if (mounted.current && execution.kind === "job") {
        try {
          onCreated(execution.job);
        } catch (error) {
          console.warn("Accepted task view could not be opened.", error);
          if (mounted.current)
            setError(
              "Task created, but its page could not be opened. Use the task link below.",
            );
        }
      }
      return execution;
    } catch (e) {
      if (mounted.current)
        setError(
          e instanceof TypeError ||
            (e instanceof DOMException &&
              ["TimeoutError", "AbortError"].includes(e.name))
            ? "Task submission could not be confirmed. Submit again to continue the same request."
            : e instanceof Error
              ? e.message
              : String(e),
        );
    } finally {
      pending.current = false;
      if (mounted.current) setBusy(false);
    }
  }
  return { submit, busy, error };
}
