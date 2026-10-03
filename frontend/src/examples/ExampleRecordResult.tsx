import { useEffect, useState } from "react";
import { api, request } from "../api";
import type { Job, Language } from "../types";
import type { PreparedExample } from "./types";
import { ExampleContext } from "./context";
import { RegionResult } from "../regions/RegionResult";
import { CampaignCasePreview } from "./CampaignCasePreview";
import { PoseResults } from "../poses/PoseResults";
import type { IdentityResult } from "../diffsbdd/types";
import { ExampleJobResult } from "./ExampleJobResult";

export function ExampleRecordResult({
  example,
  language,
}: {
  example: PreparedExample;
  language: Language;
}) {
  const record = example.record;
  const [identity, setIdentity] = useState<IdentityResult | null>(null);
  const [job, setJob] = useState<Job | null>(null);
  const [selected, setSelected] = useState(0);
  const [error, setError] = useState("");
  const attempt =
    record?.kind === "workflows" ? record.run.attempts[selected] : null;
  useEffect(() => {
    const controller = new AbortController();
    setError("");
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
          ? request<Job>(`/jobs/${attempt.job_id}`, {
              signal: controller.signal,
            }).then((value) => {
              if (!controller.signal.aborted) setJob(value);
            })
          : Promise.resolve();
    void action.catch((failure) => {
      if (!controller.signal.aborted) setError(String(failure));
    });
    return () => controller.abort();
  }, [record?.pin.record_id, attempt?.job_id]);
  if (!record) return null;
  const zh = language === "zh";
  return (
    <ExampleContext.Provider value={example}>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
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
        <PoseResults value={record.poses[0]} language={language} />
      )}
      {record.kind === "workflows" && (
        <section aria-label={zh ? "模板流程结果" : "Template workflow result"}>
          <p>
            {zh
              ? "对接产物已进入性质计算。选择一步查看它的真实输出。"
              : "The docking output was passed into property analysis. Select a step to view its actual output."}
          </p>
          <div className="segmented">
            {record.run.attempts.map((value, index) => (
              <button
                type="button"
                key={value.job_id}
                aria-pressed={index === selected}
                onClick={() => setSelected(index)}
              >
                {index + 1}.{" "}
                {record.value.body.steps.find(
                  (step) => step.id === value.step_id,
                )?.request.name ?? value.step_id}
              </button>
            ))}
          </div>
          {job && <ExampleJobResult job={job} language={language} />}
        </section>
      )}
    </ExampleContext.Provider>
  );
}
