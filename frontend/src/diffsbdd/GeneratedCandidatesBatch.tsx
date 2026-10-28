import type { Language } from "../types";
import {
  generatedBatchSummary,
  type GeneratedMetrics,
} from "./generated-metrics";
import type { CoreVerificationData } from "./types";

export function GeneratedCandidatesBatch({
  records,
  metrics,
  verification,
  language,
}: {
  records: { record: number }[];
  metrics?: GeneratedMetrics[] | null;
  verification?: CoreVerificationData;
  language: Language;
}) {
  const zh = language === "zh";
  const summary = generatedBatchSummary(records, metrics, verification);
  if (!summary)
    return (
      <p className="field-help" role="status">
        {zh
          ? "批次检查信息不完整或无法对应原始记录，无法汇总。"
          : "Batch checks are incomplete or cannot be matched to the original records; no summary is available."}
      </p>
    );
  const missing = (reported: number) =>
    reported < summary.total
      ? zh
        ? `（${summary.total - reported} 条未报告）`
        : ` (${summary.total - reported} not reported)`
      : "";
  return (
    <section aria-label={zh ? "批次结构检查" : "Batch structure checks"}>
      <strong>{zh ? "批次结构检查" : "Batch structure checks"}</strong>
      <dl className="native-result-metrics">
        <div>
          <dt>
            {zh ? "输出包含多个片段" : "Outputs with disconnected fragments"}
          </dt>
          <dd>
            {summary.disconnected} / {summary.total}
            {missing(summary.connectivityReported)}
          </dd>
        </div>
        <div>
          <dt>
            {zh
              ? "条件口袋近接小于 1.2 Å"
              : "Conditioning-pocket proximity below 1.2 Å"}
          </dt>
          <dd>
            {summary.nearPocket} / {summary.total}
          </dd>
        </div>
        <div>
          <dt>
            {zh
              ? "分子内松弛未收敛"
              : "Intramolecular relaxation not converged"}
          </dt>
          <dd>
            {summary.relaxationUnconverged} / {summary.total}
            {missing(summary.relaxationReported)}
          </dd>
        </div>
      </dl>
      <p className="field-help">
        {zh
          ? "片段数针对输出结构；近接仅覆盖生成条件口袋。未发现近接或松弛收敛不代表通过完整受体姿势质控，也不证明结合活性。"
          : "Fragment counts describe output structures; proximity covers the conditioning pocket only. Absence of close pairs or converged relaxation does not establish full-receptor pose quality or binding activity."}
      </p>
    </section>
  );
}
