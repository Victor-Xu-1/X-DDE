import "./structured-results.css";
import { isResearchField } from "../presentation/research-files";

import { resultTitle } from "./native-result-labels";

function scalar(value: unknown, zh: boolean) {
  if (value == null) return "—";
  if (typeof value === "boolean")
    return value ? (zh ? "是" : "Yes") : zh ? "否" : "No";
  return String(value);
}
function isScalar(value: unknown) {
  return value == null || typeof value !== "object";
}

/** One presentation path for native scientific records; details preserve exact values. */
export function ResultTree({ value, zh }: { value: unknown; zh: boolean }) {
  if (typeof value === "string" && value.length > 240)
    return <pre className="native-result-report">{value}</pre>;
  if (isScalar(value))
    return <span className="result-value">{scalar(value, zh)}</span>;
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
      return (
        <div className="native-result-table table-scroll">
          <table>
            <thead>
              <tr>
                <th>#</th>
                {keys.map((k) => (
                  <th key={k} title={k}>
                    {resultTitle(k, zh)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {value.map((v, i) => (
                <tr key={i}>
                  <th scope="row">{i + 1}</th>
                  {keys.map((k) => (
                    <td key={k}>{scalar(v[k], zh)}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
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
    ([key]) => isResearchField(key),
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
          open={key === "result" || key === "summary" || key === "metrics"}
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
