import type { Endpoint } from "./types";
import { endpointUnit } from "./labels";

/** Draw a native bounded classification score; never invent a regression scale. */
export function boundedScore(endpoint: Endpoint, value: number | undefined) {
  return endpoint.task_type === "classification" &&
    endpoint.minimum === 0 &&
    endpoint.maximum === 1 &&
    typeof value === "number" &&
    Number.isFinite(value) &&
    value >= 0 &&
    value <= 1
    ? value
    : null;
}

export function EndpointValue({
  endpoint,
  value,
  zh,
}: {
  endpoint: Endpoint;
  value: number | undefined;
  zh: boolean;
}) {
  const score = boundedScore(endpoint, value);
  return (
    <div className="admet-endpoint-value">
      <strong title={value == null ? undefined : String(value)}>
        {value != null && Number.isFinite(value) ? value.toPrecision(4) : "—"}
      </strong>
      <small>{endpointUnit(endpoint, zh)}</small>
      {score !== null && (
        <span
          className="admet-score-track"
          aria-hidden="true"
          data-score={score}
        >
          <span style={{ width: `${score * 100}%` }} />
        </span>
      )}
    </div>
  );
}
