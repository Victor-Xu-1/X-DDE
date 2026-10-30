import { useEffect, useRef, useState } from "react";
import { request } from "../api";
import { useTaskSubmit } from "../operations/useTaskSubmit";
import type { Job, Language } from "../types";
import type { ScientificTask } from "./types";
import { ScientificReviewBoltzGen } from "./ScientificReviewBoltzGen";

interface Checkpoint {
  job_id: string;
  sha256: string;
  counts: Record<
    "generated" | "inverse_folded" | "complex_refolded" | "binder_refolded",
    number
  >;
}

export function BinderContinuation({
  job,
  language,
  onCreated,
  available,
}: {
  job: Job;
  language: Language;
  onCreated(job: Job): void;
  available: boolean;
}) {
  if (
    job.request.operation !== "boltzgen_design" ||
    !["interrupted", "failed"].includes(job.status)
  )
    return null;
  return (
    <Continuation
      key={job.id}
      job={job}
      original={job.request}
      language={language}
      onCreated={onCreated}
      available={available}
    />
  );
}

function Continuation({
  job,
  original,
  language,
  onCreated,
  available,
}: {
  job: Job;
  original: ScientificTask;
  language: Language;
  onCreated(job: Job): void;
  available: boolean;
}) {
  const zh = language === "zh";
  const [checkpoint, setCheckpoint] = useState<Checkpoint | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const controller = useRef<AbortController | null>(null);
  const run = useTaskSubmit(onCreated);
  useEffect(() => () => controller.current?.abort(), []);
  async function inspect() {
    if (controller.current) return;
    const abort = new AbortController();
    controller.current = abort;
    setLoading(true);
    setError("");
    setCheckpoint(null);
    try {
      const value = await request<Checkpoint>(
        `/scientific/binder-checkpoints/${job.id}`,
        { signal: abort.signal },
      );
      if (abort.signal.aborted) return;
      if (
        value.job_id !== job.id ||
        !/^[a-f0-9]{64}$/.test(value.sha256) ||
        !value.counts ||
        ![
          "generated",
          "inverse_folded",
          "complex_refolded",
          "binder_refolded",
        ].every(
          (key) =>
            Number.isSafeInteger(
              value.counts[key as keyof Checkpoint["counts"]],
            ) &&
            value.counts[key as keyof Checkpoint["counts"]] >= 0 &&
            value.counts[key as keyof Checkpoint["counts"]] <=
              Number(original.payload.candidates),
        )
      )
        throw new Error("Invalid checkpoint summary");
      setCheckpoint(value);
    } catch {
      if (!abort.signal.aborted)
        setError(
          zh
            ? "已计算阶段暂无法核验。原任务和文件已保留，请重试检查。"
            : "Calculated stages could not be verified. Original files are preserved; retry inspection.",
        );
    } finally {
      if (!abort.signal.aborted) setLoading(false);
      controller.current = null;
    }
  }
  const labels: [keyof Checkpoint["counts"], string][] = [
    ["generated", zh ? "已生成结构" : "Generated structures"],
    ["inverse_folded", zh ? "已设计序列" : "Designed sequences"],
    ["complex_refolded", zh ? "已回算复合物" : "Refolded complexes"],
    ["binder_refolded", zh ? "已回算结合体" : "Refolded binders"],
  ];
  return (
    <section aria-label={zh ? "接续结合体研究" : "Continue binder study"}>
      <button
        className="secondary-button"
        disabled={loading || run.busy}
        onClick={() => void inspect()}
      >
        {loading
          ? zh
            ? "正在检查已计算阶段…"
            : "Inspecting calculated stages…"
          : zh
            ? "检查可接续的计算"
            : "Inspect calculated stages"}
      </button>
      {checkpoint && (
        <>
          <p>
            {zh
              ? "原生程序将跳过已完成阶段，继续计算缺少的结果。原任务保留为中断记录，本次结果另行保存。"
              : "The native program skips completed stages and calculates missing results. The interrupted task stays intact; this continuation saves a separate result."}
          </p>
          <table
            className="compact-table"
            aria-label={zh ? "已计算阶段" : "Calculated stages"}
          >
            <tbody>
              {labels.map(([key, label]) => (
                <tr key={key}>
                  <th>{label}</th>
                  <td>
                    {checkpoint.counts[key]} /{" "}
                    {String(original.payload.candidates)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <ScientificReviewBoltzGen
            language={language}
            payload={original.payload}
            inputs={original.inputs}
            options={original.options}
          />
          <button
            className="primary-button"
            disabled={!available || loading || run.busy}
            onClick={() =>
              void run.submit({
                ...original,
                name: `${zh ? "接续" : "Continued"} · ${original.name}`.slice(
                  0,
                  80,
                ),
                payload: {
                  ...original.payload,
                  continuation: {
                    job_id: checkpoint.job_id,
                    sha256: checkpoint.sha256,
                  },
                },
              })
            }
          >
            {run.busy
              ? zh
                ? "正在提交…"
                : "Submitting…"
              : zh
                ? "接续已计算阶段"
                : "Continue calculated stages"}
          </button>
        </>
      )}
      {(error || run.error) && <p role="alert">{error || run.error}</p>}
    </section>
  );
}
