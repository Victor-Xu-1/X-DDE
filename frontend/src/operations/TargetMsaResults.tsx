import type { Job, Language } from "../types";
import { artifactUrl } from "../api";
import { SequenceTrack } from "../presentation/SequenceTrack";
import { AlignmentResults } from "../presentation/alignment/AlignmentResults";
import { alignmentFiles } from "../presentation/alignment/alignment-data";
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
  let files: ReturnType<typeof alignmentFiles> = [],
    invalid = false;
  try {
    files = alignmentFiles(value.alignment_files ?? []);
  } catch {
    invalid = true;
  }
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
      {files.length > 0 && sequence ? (
        <AlignmentResults
          key={job.id}
          jobId={job.id}
          files={files}
          query={sequence}
          language={language}
        />
      ) : (
        <>
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
              ? invalid
                ? "比对文件描述无法验证，请下载原始结果。"
                : "此历史结果未保存可移植的多序列比对文件；可重新运行以获取完整比对。"
              : invalid
                ? "The alignment manifest could not be verified; download the original result."
                : "This historical result did not retain portable alignment files. Run it again to obtain the complete alignment."}
          </p>
        </>
      )}
    </section>
  );
}
