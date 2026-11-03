import type { Language } from "../types";
import { artifactUrl } from "../api";
import "./prediction-workspace.css";

export interface PredictionSample {
  id: string;
  seed: number | null;
  sample: number | null;
  artifact?: string | null;
  metrics: {
    name: string;
    value: number | null;
    unit: string;
    method?: string;
  }[];
}

/** Selection, metrics and download all refer to the same native candidate. */
export function PredictionSamples({
  job,
  rows,
  selected,
  onSelect,
  language,
}: {
  job: string;
  rows: PredictionSample[];
  selected: string;
  onSelect(id: string): void;
  language: Language;
}) {
  const zh = language === "zh";
  const active = rows.find((row) => row.id === selected);
  if (!active) return null;
  const seeds = [...new Set(rows.map((row) => row.seed))];
  const group = rows.filter((row) => row.seed === active.seed);
  const current = group.findIndex((row) => row.id === active.id);
  const label = (row: PredictionSample) =>
    `${zh ? "构象" : "Sample"} ${row.sample ?? row.id}`;
  return (
    <section
      className="prediction-sample-bar"
      aria-label={zh ? "构象与置信度" : "Sample and confidence"}
    >
      <div className="prediction-seed-picker">
        <label>
          <span>{zh ? "随机种子" : "Seed"}</span>
          <select
            value={active.seed ?? "unknown"}
            aria-label={zh ? "选择随机种子" : "Select seed"}
            onChange={(event) => {
              const next = rows.find(
                (row) => String(row.seed ?? "unknown") === event.target.value,
              );
              if (next) onSelect(next.id);
            }}
          >
            {seeds.map((seed) => (
              <option key={seed ?? "unknown"} value={seed ?? "unknown"}>
                {seed ?? (zh ? "未记录" : "Not recorded")}
              </option>
            ))}
          </select>
        </label>
      </div>
      <div className="prediction-sample-picker">
        <span>{zh ? "预测构象" : "Sample"}</span>
        <nav aria-label={zh ? "切换构象" : "Prediction samples"}>
          <button
            type="button"
            aria-label={zh ? "上一个构象" : "Previous sample"}
            disabled={current <= 0}
            onClick={() => onSelect(group[current - 1].id)}
          >
            ‹
          </button>
          <div className="prediction-sample-options">
            {group.map((row) => (
              <button
                type="button"
                key={row.id}
                aria-label={label(row)}
                aria-pressed={row.id === active.id}
                title={row.id}
                onClick={() => onSelect(row.id)}
              >
                {row.sample ?? row.id}
              </button>
            ))}
          </div>
          <button
            type="button"
            aria-label={zh ? "下一个构象" : "Next sample"}
            disabled={current >= group.length - 1}
            onClick={() => onSelect(group[current + 1].id)}
          >
            ›
          </button>
        </nav>
      </div>
      <dl
        className="prediction-confidence-metrics"
        aria-label={
          zh ? "当前构象的原生指标" : "Selected sample native metrics"
        }
      >
        {active.metrics.slice(0, 4).map((metric) => (
          <div key={metric.name + metric.unit}>
            <dt title={metric.method}>
              {metric.name}
              {metric.unit && <small>{metric.unit}</small>}
            </dt>
            <dd>
              {metric.value !== null && Number.isFinite(metric.value)
                ? metric.value.toFixed(
                    metric.name.toLowerCase().includes("plddt") &&
                      metric.unit !== "0–1"
                      ? 1
                      : 2,
                  )
                : "—"}
            </dd>
          </div>
        ))}
      </dl>
      {active.artifact && (
        <a
          className="prediction-model-download"
          href={artifactUrl(job, active.artifact)}
          download
        >
          {zh ? "下载此构象" : "This model"} ↓
        </a>
      )}
    </section>
  );
}
