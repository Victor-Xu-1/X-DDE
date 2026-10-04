import type { Job, Language } from "../types";
import { artifactUrl } from "../api";
import { SequenceTrack } from "../presentation/SequenceTrack";
export function TargetMsaResults({
  job,
  value,
  language,
}: {
  job: Job;
  value: Record<string, unknown>;
  language: Language;
}) {
  const zh = language === "zh",
    payload = job.request.operation === "harness" ? job.request.payload : {};
  const sequence = typeof payload.sequence === "string" ? payload.sequence : "";
  return (
    <section className="target-msa-results">
      <header className="evidence-material-toolbar">
        <h3>
          {String(
            value.target_name ??
              (zh ? "靶标序列比对" : "Target sequence alignment"),
          )}
        </h3>
        <a download href={artifactUrl(job.id, "result.json")}>
          {zh ? "下载原始结果" : "Download original result"}
        </a>
      </header>
      <div className="result-summary-grid">
        <dl>
          <dt>{zh ? "目标链" : "Target chain"}</dt>
          <dd>{String(value.chain_id ?? "—")}</dd>
        </dl>
        <dl>
          <dt>{zh ? "原生比对深度" : "Native alignment depth"}</dt>
          <dd>
            {typeof value.alignment_depth === "number"
              ? value.alignment_depth
              : "—"}
          </dd>
        </dl>
      </div>
      {sequence && (
        <SequenceTrack
          sequence={sequence}
          language={language}
          label={
            zh ? "用于比对的靶标序列" : "Target sequence used for alignment"
          }
        />
      )}
      <p className="field-help">
        {zh
          ? "此结果保存比对深度和靶标序列。当前原生任务未附带可下载的多序列比对文件，因此不展示推测的比对矩阵。"
          : "This result retains alignment depth and the target sequence. The native task did not attach a portable multiple-sequence alignment file, so no inferred alignment matrix is shown."}
      </p>
    </section>
  );
}
