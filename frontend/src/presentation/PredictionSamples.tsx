import { useLayoutEffect, useRef } from "react";
import type { Language } from "../types";
import { PredictionSampleDownload } from "./PredictionSampleDownload";
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

const rankingScore = (row: PredictionSample) =>
  row.metrics.find((metric) => metric.name === "Ranking score")?.value;

function bestRanked(rows: PredictionSample[]) {
  let best: PredictionSample | undefined;
  let score = -Infinity;
  for (const row of rows) {
    const ranking = rankingScore(row);
    if (
      typeof ranking === "number" &&
      Number.isFinite(ranking) &&
      ranking > score
    ) {
      best = row;
      score = ranking;
    }
  }
  return best;
}

/** Selection, metrics and download all refer to the same native candidate. */
export function PredictionSamples({
  job,
  rows,
  selected,
  onSelect,
  language,
  overlayCount = 0,
}: {
  job: string;
  rows: PredictionSample[];
  selected: string;
  onSelect(id: string): void;
  language: Language;
  overlayCount?: number;
}) {
  const zh = language === "zh";
  const active = rows.find((row) => row.id === selected);
  const sampleOptions = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const list = sampleOptions.current;
    const button = list?.querySelector<HTMLButtonElement>(
      '[aria-pressed="true"]',
    );
    if (!list || !button) return;
    const frame = list.getBoundingClientRect();
    const item = button.getBoundingClientRect();
    if (item.left < frame.left) list.scrollLeft += item.left - frame.left;
    else if (item.right > frame.right)
      list.scrollLeft += item.right - frame.right;
  }, [job, selected]);
  if (!active) return null;
  const seeds = [...new Set(rows.map((row) => row.seed))];
  const group = rows.filter((row) => row.seed === active.seed);
  const current = group.findIndex((row) => row.id === active.id);
  const best = active.seed === null ? undefined : bestRanked(group);
  const overlay = overlayCount > 1;
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
              const candidates = rows.filter(
                (row) => String(row.seed ?? "unknown") === event.target.value,
              );
              const next =
                event.target.value === "unknown"
                  ? candidates[0]
                  : (bestRanked(candidates) ?? candidates[0]);
              if (next) onSelect(next.id);
            }}
          >
            {seeds.map((seed) => {
              const ranked =
                seed === null
                  ? undefined
                  : bestRanked(rows.filter((row) => row.seed === seed));
              const score = ranked ? rankingScore(ranked) : undefined;
              return (
                <option key={seed ?? "unknown"} value={seed ?? "unknown"}>
                  {seed ?? (zh ? "未记录" : "Not recorded")}
                  {typeof score === "number" && ` · ${score.toFixed(2)}`}
                </option>
              );
            })}
          </select>
        </label>
      </div>
      <div className="prediction-sample-picker">
        <div className="prediction-sample-caption">
          <span>{zh ? "预测构象" : "Sample"}</span>
          {best && group.length > 1 && (
            <button
              className="prediction-best-sample"
              type="button"
              onClick={() => onSelect(best.id)}
              title={
                zh
                  ? "按此种子的原生排序分数选择"
                  : "Select by this seed's native ranking score"
              }
            >
              {zh ? "最高排序分" : "Highest ranking"} · {best.sample ?? best.id}
            </button>
          )}
        </div>
        <nav aria-label={zh ? "切换构象" : "Prediction samples"}>
          <button
            type="button"
            aria-label={zh ? "上一个构象" : "Previous sample"}
            disabled={current <= 0}
            onClick={() => onSelect(group[current - 1].id)}
          >
            ‹
          </button>
          <div className="prediction-sample-options" ref={sampleOptions}>
            {group.map((row) => (
              <button
                type="button"
                key={row.id}
                aria-label={label(row)}
                aria-pressed={!overlay && row.id === active.id}
                title={row.id}
                onClick={() => onSelect(row.id)}
              >
                {row.sample ?? /^structure-(\d+)$/.exec(row.id)?.[1] ?? row.id}
                {best?.id === row.id && group.length > 1 && (
                  <span
                    className="prediction-sample-marker"
                    aria-hidden="true"
                  />
                )}
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
      {overlay ? (
        <p className="prediction-overlay-status" role="status">
          {zh
            ? `正在叠加 ${overlayCount} 个构象`
            : `Overlaying ${overlayCount} samples`}
        </p>
      ) : (
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
      )}
      {!overlay && active.artifact && (
        <PredictionSampleDownload
          key={JSON.stringify([job, active.id, active.artifact])}
          job={job}
          candidate={active.id}
          artifact={active.artifact}
          language={language}
        />
      )}
    </section>
  );
}
