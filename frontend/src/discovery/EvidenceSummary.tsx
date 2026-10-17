import type { Language } from "../types";
import type { TargetResearchResult } from "./types";

export function EvidenceSummary({
  result,
  language,
}: {
  result: TargetResearchResult;
  language: Language;
}) {
  const zh = language === "zh";
  const disease = result.request.entity === "disease";
  const association =
    result.entity.associatedTargets ?? result.entity.associatedDiseases;
  return (
    <>
      <header className="evidence-header">
        <div>
          <span className="questionnaire-overline">
            {disease
              ? zh
                ? "疾病证据"
                : "DISEASE EVIDENCE"
              : zh
                ? "靶点证据"
                : "TARGET EVIDENCE"}
          </span>
          <h3>
            {result.entity.approvedSymbol ??
              result.entity.name ??
              result.entity.id}
          </h3>
          {result.entity.approvedName && (
            <p className="field-help">{result.entity.approvedName}</p>
          )}
        </div>
        <span title={result.retrieved_at}>
          {zh ? "公共数据库证据" : "Public database evidence"}
        </span>
      </header>
      <div
        className="discovery-sources"
        aria-label={zh ? "来源状态" : "Source states"}
      >
        {result.sources.map((source) => (
          <span
            className={"is-" + source.status}
            key={source.source}
            title={source.reason}
          >
            {source.source} ·{" "}
            {
              {
                ok: zh ? "已获取" : "Retrieved",
                empty: zh ? "未找到" : "Empty",
                ambiguous: zh ? "需核对映射" : "Ambiguous",
                unavailable: zh ? "获取失败" : "Unavailable",
              }[source.status]
            }
          </span>
        ))}
      </div>
      {result.sources
        .filter((source) => source.status === "unavailable")
        .map((source) => (
          <p className="error-box" role="alert" key={source.source}>
            {source.source}: {source.reason}
          </p>
        ))}
      <dl className="result-summary-grid">
        <div>
          <dt>{zh ? "来源关联" : "Source associations"}</dt>
          <dd>{association?.count ?? "—"}</dd>
        </div>
        {disease ? (
          <div>
            <dt>{zh ? "本次获取" : "Retrieved associations"}</dt>
            <dd>{association?.rows.length ?? "—"}</dd>
          </div>
        ) : (
          <>
            <div>
              <dt>{zh ? "实验结构索引" : "Structure references"}</dt>
              <dd>
                {result.materials.length
                  ? result.materials.reduce((n, m) => n + m.structure_total, 0)
                  : "—"}
              </dd>
            </div>
            <div>
              <dt>{zh ? "实测活性记录" : "Reported activity records"}</dt>
              <dd>{result.activities?.total ?? "—"}</dd>
            </div>
          </>
        )}
      </dl>
    </>
  );
}
