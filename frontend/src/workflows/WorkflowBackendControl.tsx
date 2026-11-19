import { useEffect, useState } from "react";
import { request } from "../api";
import type { Language } from "../types";
import { TaskBackendControl } from "../utilities/TaskBackendControl";
import type { WorkflowPlan } from "./types";
import { workflowOperations } from "./model";

export function WorkflowBackendControl({
  plan,
  runPlanId,
  draftOperations = [],
  language,
}: {
  plan: WorkflowPlan | null | undefined;
  runPlanId?: string;
  draftOperations?: string[];
  language: Language;
}) {
  const missingId = runPlanId && plan?.id !== runPlanId ? runPlanId : undefined;
  const [result, setResult] = useState<{
    id: string;
    plan: WorkflowPlan | null;
  }>();
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    if (!missingId) return;
    const read = new AbortController();
    void request<WorkflowPlan>(
      `/workflows/plans/${encodeURIComponent(missingId)}`,
      {
        signal: read.signal,
      },
    )
      .then((value) => {
        if (value?.id !== missingId || !Array.isArray(value.body?.steps))
          throw new Error("Invalid workflow plan");
        if (!read.signal.aborted) setResult({ id: missingId, plan: value });
      })
      .catch(() => {
        if (!read.signal.aborted) setResult({ id: missingId, plan: null });
      });
    return () => read.abort();
  }, [missingId, attempt]);

  const fetched = result?.id === missingId ? result : undefined;
  const current = missingId ? fetched?.plan : plan;
  const operations = current
    ? workflowOperations(current.body.steps)
    : missingId
      ? []
      : draftOperations;
  if (operations.length)
    return (
      <TaskBackendControl
        language={language}
        scope={{ operations }}
        placement="entry"
      />
    );
  const zh = language === "zh";
  if (!missingId)
    return (
      <p className="task-backend-pending">
        {zh
          ? "选择任务后，可在这里启停所需后端。"
          : "Select tasks to see their backend switches here."}
      </p>
    );
  return fetched ? (
    <p className="backend-state-message" role="alert">
      {zh
        ? "无法读取这次运行所需的后端。"
        : "Cannot read the backends for this run."}
      <button
        className="text-button"
        type="button"
        onClick={() => {
          setResult(undefined);
          setAttempt((value) => value + 1);
        }}
      >
        {zh ? "重试" : "Retry"}
      </button>
    </p>
  ) : (
    <span className="task-backend-pending" role="status">
      {zh ? "正在读取后端…" : "Reading backend…"}
    </span>
  );
}
