import type { Language } from "../types";
import type { CoreVerificationData } from "./types";
import { coreFailureText } from "./CoreVerification";

function object(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}
function attempt(value: unknown): number | null {
  return typeof value === "number" && Number.isSafeInteger(value) && value > 0
    ? value
    : null;
}

/** Explain both exclusion stages without exposing logs or confusing output records with attempts. */
export function GenerationRejections({
  report,
  verification,
  language,
}: {
  report: unknown;
  verification?: CoreVerificationData;
  language: Language;
}) {
  const zh = language === "zh";
  const native = object(report);
  const chemical = Array.isArray(native?.rejected) ? native.rejected : [];
  const molecules = Array.isArray(native?.molecules) ? native.molecules : [];
  const rows = chemical.flatMap((entry, index) => {
    const row = object(entry);
    if (!row) return [];
    const disconnected =
      typeof row.reason === "string" && /disconnect|fragment/i.test(row.reason);
    return [
      {
        key: `chemical-${index}`,
        attempt: attempt(row.attempt),
        record: null as number | null,
        reason: disconnected
          ? zh
            ? "分子包含互不连接的片段。"
            : "The molecule contains disconnected fragments."
          : zh
            ? "分子价态或化学结构检查未通过。"
            : "The molecule did not pass chemical structure or valence checks.",
      },
    ];
  });
  for (const candidate of verification?.candidates ?? []) {
    if (candidate.status === "passed") continue;
    const nativeRow = object(molecules[candidate.record]);
    rows.push({
      key: `core-${candidate.record}`,
      attempt: attempt(nativeRow?.attempt),
      record: candidate.record,
      reason:
        candidate.status === "indeterminate"
          ? zh
            ? "无法确认固定区域、连接位置或立体化学符合要求。"
            : "The fixed region, attachment sites or stereochemistry could not be verified."
          : coreFailureText(candidate.reason, language),
    });
  }
  rows.sort((a, b) => (a.attempt ?? Infinity) - (b.attempt ?? Infinity));
  return (
    <details>
      <summary>
        {zh ? "为什么没有有效候选？" : "Why were no candidates accepted?"}
      </summary>
      {rows.length ? (
        <div className="table-scroll">
          <table
            className="compact-table"
            aria-label={zh ? "候选排除原因" : "Candidate exclusion reasons"}
          >
            <thead>
              <tr>
                <th>{zh ? "采样 / 结构" : "Attempt / structure"}</th>
                <th>{zh ? "原因" : "Reason"}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.key}>
                  <td>
                    {row.attempt !== null
                      ? `${zh ? "采样" : "Attempt"} ${row.attempt}`
                      : row.record !== null
                        ? `${zh ? "结构" : "Structure"} ${row.record + 1}`
                        : zh
                          ? "未提供编号"
                          : "Number unavailable"}
                  </td>
                  <td>{row.reason}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p>
          {zh
            ? "原始结果未提供具体排除原因。请检查研究输入后再调整方案。"
            : "The original result did not provide specific exclusion reasons. Review the research inputs before adjusting the design."}
        </p>
      )}
      {verification?.attachment_policy === "original_cuts" &&
        rows.some((row) => row.key.startsWith("core-")) && (
          <p className="field-help">
            {zh
              ? "需要只替换一个连接点时，可选择适合该用途的 R 基团设计方法；保留原有连接位置检查。"
              : "For replacement at a single attachment site, consider an R-group design method; keep the original attachment-site checks enabled."}
          </p>
        )}
    </details>
  );
}
