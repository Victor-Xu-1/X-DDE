import { useEffect, useState } from "react";
import { request } from "../api";
import type { Job, Language } from "../types";
import type { Support } from "./types";
import { reasons } from "./model";
export function ConstraintReceipt({
  job,
  language,
}: {
  job: Job;
  language: Language;
}) {
  const zh = language === "zh",
    [value, setValue] = useState<(Support & { state: string }) | null>(null),
    [error, setError] = useState("");
  useEffect(() => {
    const c = new AbortController();
    setValue(null);
    setError("");
    void request<Support & { state: string }>(`/jobs/${job.id}/constraints`, {
      signal: c.signal,
    })
      .then((v) => {
        if (!c.signal.aborted) setValue(v);
      })
      .catch((e) => {
        if (!c.signal.aborted) setError(String(e));
      });
    return () => c.abort();
  }, [job.id, job.status]);
  return (
    <details className="input-summary">
      <summary>
        {zh ? "条件与执行依据" : "Conditions and execution evidence"}
      </summary>
      {error ? (
        <p role="alert">{error}</p>
      ) : !value ? (
        <p role="status">
          {zh ? "正在读取条件依据…" : "Loading condition evidence…"}
        </p>
      ) : value.state === "not_started" ? (
        <p>
          {zh
            ? "任务尚未生成执行快照"
            : "No execution snapshot has been captured"}
        </p>
      ) : (
        <>
          <strong>{value.document.name}</strong>
          <ul>
            {value.conditions.map((c) => (
              <li key={c.condition_id}>
                {reasons[c.reason_code]?.[zh ? 0 : 1] ?? c.reason}
              </li>
            ))}
          </ul>
          <p className="field-help">
            {zh
              ? "此记录证明提交的条件和参数，不证明计算成功或结果满足条件。独立结果复核尚未实现。"
              : "This snapshot records requested conditions and parameters, not calculation success or output compliance. Independent result verification is not implemented."}
          </p>
        </>
      )}
    </details>
  );
}
