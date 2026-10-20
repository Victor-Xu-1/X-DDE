import type { Language } from "../types";
import type { DatasetCandidate, DatasetResult } from "./types";
import { useDELCandidateEvidence } from "./useDELCandidateEvidence";
import "./candidate-evidence.css";

export function DELCandidateEvidence({
  jobId,
  candidate,
  result,
  language,
}: {
  jobId: string;
  candidate: DatasetCandidate;
  result: DatasetResult;
  language: Language;
}) {
  const zh = language === "zh";
  const { value, failed, unavailable, retry } = useDELCandidateEvidence(
    jobId,
    candidate,
    result,
  );
  const number = (value: number) => (value === 0 ? "0" : value.toPrecision(4));
  return (
    <section
      className="dataset-candidate-evidence"
      aria-label={zh ? "原 DEL 成员证据" : "Encoded-member evidence"}
    >
      <h3>{zh ? "原 DEL 成员证据" : "Encoded-member evidence"}</h3>
      {value && (
        <p className="dataset-evidence-comparison">{value.comparisonLabel}</p>
      )}
      {unavailable ? (
        <p>
          {zh
            ? "此结果未提供匹配的计数来源；原始结构保持可用。"
            : "This result has no matching count source; original structures remain available."}
        </p>
      ) : value ? (
        <>
          <dl>
            <div>
              <dt>{zh ? "靶点 / 对照计数" : "Target / reference counts"}</dt>
              <dd>
                {value.selection.toLocaleString()} /{" "}
                {value.reference.toLocaleString()}
              </dd>
            </div>
            <div>
              <dt>{zh ? "计数模型区间" : "Count-model interval"}</dt>
              <dd>
                {number(value.lower)} – {number(value.upper)}
              </dd>
            </div>
            <div>
              <dt>{zh ? "支持样本" : "Supporting samples"}</dt>
              <dd>
                {value.supporting_samples === undefined
                  ? "—"
                  : `${value.supporting_samples} / ${value.target_samples}`}
              </dd>
            </div>
            <div>
              <dt>{zh ? "靶点样本 CV" : "Target-sample CV"}</dt>
              <dd>
                {value.replicate_cv === null
                  ? "—"
                  : value.replicate_cv.toFixed(3)}
              </dd>
            </div>
          </dl>
          <p>
            {value.reference === 0 &&
              (zh
                ? "对照为零表示未观察到。"
                : "Zero reference counts mean not observed. ")}
            {value.countUnit === "reads"
              ? zh
                ? "原始读段保留 PCR 偏倚。"
                : "Raw reads retain PCR bias. "
              : value.countUnit === "reported_counts"
                ? zh
                  ? "外部报告计数，处理方法未独立核实。"
                  : "Externally reported counts; processing unverified. "
                : ""}
            {zh
              ? "富集和区间不代表衍生结构亲和力或生物学重复验证。"
              : "Enrichment and intervals do not establish derived-molecule affinity or biological reproducibility."}
          </p>
        </>
      ) : failed ? (
        <p role="alert">
          {zh
            ? "来源计数暂不可核对，候选结构仍可使用。"
            : "Source counts could not be verified; candidate structures remain available."}{" "}
          <button type="button" onClick={retry}>
            {zh ? "重试" : "Retry"}
          </button>
        </p>
      ) : (
        <p role="status">
          {zh
            ? "正在读取所选成员的计数证据…"
            : "Loading count evidence for the selected member…"}
        </p>
      )}
    </section>
  );
}
