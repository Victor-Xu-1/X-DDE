import "./structured-results.css";
import { isResearchField } from "../presentation/research-files";

import { resultTitle } from "./native-result-labels";
import { unwrapResult, researchText } from "../presentation/research-content";
import { ResearchTable } from "../presentation/ResearchTable";

function scalar(value: unknown, zh: boolean) {
  if (value == null) return "—";
  if (typeof value === "boolean")
    return value ? (zh ? "是" : "Yes") : zh ? "否" : "No";
  if (
    typeof value === "number" &&
    Number.isFinite(value) &&
    !Number.isInteger(value)
  )
    return String(Number(value.toPrecision(6)));
  return researchText(String(value), zh);
}
function isScalar(value: unknown) {
  return value == null || typeof value !== "object";
}

/** One presentation path for native scientific records; details preserve exact values. */
export function ResultTree({ value, zh }: { value: unknown; zh: boolean }) {
  value = unwrapResult(value);
  if (typeof value === "string" && value.length > 240)
    return (
      <pre className="native-result-report">{researchText(value, zh)}</pre>
    );
  if (isScalar(value))
    return (
      <span
        className="result-value"
        title={typeof value === "number" ? String(value) : undefined}
      >
        {scalar(value, zh)}
      </span>
    );
  if (Array.isArray(value)) {
    if (!value.length)
      return <span className="muted">{zh ? "无条目" : "No entries"}</span>;
    if (value.every(isScalar))
      return (
        <span className="result-list-values">
          {value.map((v, i) => (
            <span key={i}>{scalar(v, zh)}</span>
          ))}
        </span>
      );
    const flat = value.every(
      (v) =>
        v &&
        typeof v === "object" &&
        !Array.isArray(v) &&
        Object.values(v).every(isScalar),
    );
    if (flat) {
      const keys = [...new Set(value.flatMap((v) => Object.keys(v)))].filter(
        isResearchField,
      );
      const rows = value.map((record, index) => ({
        record: record as Record<string, string | number | boolean | null>,
        index,
      }));
      return (
        <ResearchTable
          rows={rows}
          rowId={(row) => String(row.index)}
          title={zh ? "科学结果记录" : "Scientific result records"}
          language={zh ? "zh" : "en"}
          columns={[
            {
              key: "index",
              label: "#",
              value: (row) => row.index + 1,
              numeric: true,
            },
            ...keys.map((key) => ({
              key,
              label: resultTitle(key, zh),
              value: (row: (typeof rows)[number]) => row.record[key],
              render: (row: (typeof rows)[number]) =>
                scalar(row.record[key], zh),
            })),
          ]}
        />
      );
    }
    return (
      <div className="native-result-records">
        {value.map((entry, i) => (
          <details key={i}>
            <summary>
              {zh ? "记录" : "Record"} {i + 1}
            </summary>
            <ResultTree value={entry} zh={zh} />
          </details>
        ))}
      </div>
    );
  }
  const entries = Object.entries(value as Record<string, unknown>).filter(
    ([key, value]) =>
      isResearchField(key) &&
      !(key === "structure" && typeof value === "string") &&
      !(
        value == null &&
        ["error", "reason", "service", "endpoint"].includes(key)
      ) &&
      !(
        Array.isArray(value) &&
        value.length === 0 &&
        ["warnings", "errors"].includes(key)
      ),
  );
  const simple = entries.filter(
    ([, v]) =>
      (isScalar(v) && !(typeof v === "string" && v.length > 240)) ||
      (Array.isArray(v) && v.every(isScalar)),
  );
  const groups = entries.filter(([key]) => !simple.some(([k]) => k === key));
  return (
    <div className="native-results">
      {simple.length > 0 && (
        <dl className="native-result-metrics">
          {simple.map(([key, entry]) => (
            <div key={key}>
              <dt title={key}>{resultTitle(key, zh)}</dt>
              <dd>
                <ResultTree value={entry} zh={zh} />
              </dd>
            </div>
          ))}
        </dl>
      )}
      {groups.map(([key, entry]) => (
        <details
          className="native-result-group"
          key={key}
          open={[
            "result",
            "summary",
            "metrics",
            "candidates",
            "soluble_mpnn_scores",
            "soluble_mpnn_seqids",
          ].includes(key)}
        >
          <summary>
            {resultTitle(key, zh)}
            {Array.isArray(entry) && (
              <span className="muted"> · {entry.length}</span>
            )}
          </summary>
          <ResultTree value={entry} zh={zh} />
        </details>
      ))}
    </div>
  );
}
