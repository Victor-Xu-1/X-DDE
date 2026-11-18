import { useEffect, useLayoutEffect, useState } from "react";
import { api, request } from "../api";
import type { Job, Language } from "../types";
import type { PreparedExample } from "./types";
import { ExampleContext } from "./context";
import { EvidenceResults } from "../evidence/EvidenceResults";
import { RegionResult } from "../regions/RegionResult";
import { CampaignCasePreview } from "./CampaignCasePreview";
import { PoseResults } from "../poses/PoseResults";
import type { IdentityResult } from "../diffsbdd/types";
import { ExampleJobResult } from "./ExampleJobResult";
import { StudyInputPreview } from "./StudyInputPreview";
import { DatasetStudyInputPreview } from "./DatasetStudyInputPreview";
import { ExampleStageNavigation } from "./ExampleStageNavigation";

export function ExampleRecordResult({
  example,
  language,
  onJobChange,
}: {
  example: PreparedExample;
  language: Language;
  onJobChange?(job: Job | null): void;
}) {
  const record = example.record;
  const [identity, setIdentity] = useState<IdentityResult | null>(null);
  const [job, setJob] = useState<Job | null>(null);
  const [selected, setSelected] = useState(0);
  const [error, setError] = useState(false);
  const attempt =
    record?.kind === "workflows" ? record.run.attempts[selected] : null;
  const currentJob = attempt?.job_id === job?.id ? job : null;
  const workflow = record?.kind === "workflows";
  useLayoutEffect(() => {
    if (workflow) onJobChange?.(currentJob);
  }, [onJobChange, currentJob, workflow]);
  useEffect(() => {
    const controller = new AbortController();
    setError(false);
    setIdentity(null);
    setJob(null);
    const action =
      record?.kind === "regions"
        ? api
            .result(record.value.body.identity_job, controller.signal)
            .then((value) => {
              if (!controller.signal.aborted)
                setIdentity(value as unknown as IdentityResult);
            })
        : attempt
          ? request<Job>(`/jobs/${encodeURIComponent(attempt.job_id)}`, {
              signal: controller.signal,
            }).then((value) => {
              if (value.id !== attempt.job_id || value.status !== "succeeded")
                throw new Error("This reviewed step is unavailable.");
              if (!controller.signal.aborted) setJob(value);
            })
          : Promise.resolve();
    void action.catch(() => {
      if (!controller.signal.aborted) setError(true);
    });
    return () => controller.abort();
  }, [record?.pin.record_id, attempt?.job_id]);
  if (!record)
    return example.study?.id === "del6" ? (
      <DatasetStudyInputPreview example={example} language={language} />
    ) : example.study ? (
      <StudyInputPreview example={example} language={language} />
    ) : null;
  const zh = language === "zh";
  return (
    <ExampleContext.Provider value={example}>
      {error && (
        <p className="error" role="alert">
          {zh ? "此示例结果暂不可用。" : "This example result is unavailable."}
        </p>
      )}
      {record.kind === "experimental.evidence" && (
        <EvidenceResults value={record.value} language={language} />
      )}
      {record.kind === "regions" && (
        <RegionResult
          record={record.value}
          identity={identity}
          language={language}
        />
      )}
      {record.kind === "campaign" && (
        <CampaignCasePreview language={language} />
      )}
      {record.kind === "pose_exploration" && record.poses[0] && (
        <PoseResults value={record.poses[0]} language={language} fixedExample />
      )}
      {record.kind === "workflows" && (
        <section aria-label={zh ? "模板流程结果" : "Template workflow result"}>
          {attempt && (
            <ExampleStageNavigation
              kind="workflow"
              language={language}
              selected={attempt.job_id}
              stages={record.run.attempts.map((value) => ({
                id: value.job_id,
                label:
                  record.value.body.steps.find(
                    (step) => step.id === value.step_id,
                  )?.request.name ?? value.step_id,
              }))}
              onSelect={(id) => {
                const index = record.run.attempts.findIndex(
                  (value) => value.job_id === id,
                );
                if (index >= 0) setSelected(index);
              }}
            />
          )}
          {currentJob && (
            <ExampleJobResult
              job={currentJob}
              language={language}
              showSource={!onJobChange}
            />
          )}
          <details className="example-result-review">
            <summary>{zh ? "工作流说明" : "Workflow notes"}</summary>
            <p>
              {record.value.body.steps.some((step) => step.quality_gate)
                ? zh
                  ? "所选姿势通过了计划指定的质控检查，再进入后续计算。"
                  : "The selected pose passed the plan's required quality checks before downstream calculations."
                : zh
                  ? "研究已按所列步骤完成。"
                  : "The study completed the listed steps."}
            </p>
          </details>
        </section>
      )}
    </ExampleContext.Provider>
  );
}
