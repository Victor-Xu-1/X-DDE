import type { Language } from "../types";
import { PlotFrame } from "./PlotFrame";
export interface ModelPoint {
  observed: number;
  predicted: number;
}
export function ModelValidationPlot({
  points,
  metrics,
  language,
  application = false,
}: {
  points: ModelPoint[];
  metrics: Record<string, number>;
  language: Language;
  application?: boolean;
}) {
  const zh = language === "zh",
    max = Math.max(1, ...points.flatMap((p) => [p.observed, p.predicted]));
  const compared =
    Number.isFinite(metrics.rmse_log1p_enrichment) &&
    Number.isFinite(metrics.mean_baseline_rmse);
  const improvesBaseline =
    compared && metrics.rmse_log1p_enrichment < metrics.mean_baseline_rmse;
  return (
    <div className="dataset-model-validation">
      <PlotFrame
        language={language}
        title={
          application
            ? zh
              ? "模型应用 · 非独立验证"
              : "Model application · not independent validation"
            : zh
              ? "独立留出 · 观察与预测富集"
              : "Independent holdout · observed vs predicted enrichment"
        }
      >
        {[0, 0.25, 0.5, 0.75, 1].map((v) => (
          <g key={v}>
            <line
              x1={60}
              x2={580}
              y1={265 - v * 225}
              y2={265 - v * 225}
              stroke="#e9eef5"
            />
            <text
              x={52}
              y={269 - v * 225}
              textAnchor="end"
              fontSize={11}
              fill="#63738c"
            >
              {(v * max).toFixed(1)}
            </text>
            <text
              x={60 + v * 520}
              y={284}
              textAnchor="middle"
              fontSize={11}
              fill="#63738c"
            >
              {(v * max).toFixed(1)}
            </text>
          </g>
        ))}
        <line x1={60} x2={580} y1={265} y2={265} stroke="#cbd5e1" />
        <line x1={60} x2={60} y1={265} y2={40} stroke="#cbd5e1" />
        <line
          x1={60}
          x2={580}
          y1={265}
          y2={40}
          stroke="#aab8ca"
          strokeDasharray="5 5"
        />
        {points.map((p, i) => (
          <circle
            key={i}
            cx={60 + (p.observed / max) * 520}
            cy={265 - (p.predicted / max) * 225}
            r={3}
            fill="#7864dd"
            opacity={0.65}
          >
            <title>
              {p.observed.toFixed(3)} / {p.predicted.toFixed(3)}
            </title>
          </circle>
        ))}
        <text x={315} y={309} textAnchor="middle" fontSize={12} fill="#526174">
          {zh ? "观察 log(1＋富集)" : "Observed log(1+enrichment)"}
        </text>
        <text
          x={16}
          y={155}
          transform="rotate(-90 16 155)"
          textAnchor="middle"
          fontSize={12}
          fill="#526174"
        >
          {zh ? "预测值" : "Prediction"}
        </text>
      </PlotFrame>
      {!application && (
        <section
          className="dataset-model-assessment"
          aria-label={zh ? "独立验证指标" : "Independent validation metrics"}
        >
          <h3>{zh ? "独立验证" : "Independent validation"}</h3>
          {compared && (
            <p className="dataset-model-comparison">
              {improvesBaseline
                ? zh
                  ? "留出误差低于简单基线"
                  : "Holdout error is below the simple baseline"
                : zh
                  ? "尚未优于简单基线"
                  : "Has not outperformed the simple baseline"}
            </p>
          )}
          <div className="dataset-model-metrics">
            {[
              ["rmse_log1p_enrichment", zh ? "模型误差 RMSE" : "Model RMSE"],
              [
                "mean_baseline_rmse",
                zh ? "均值基线误差" : "Mean baseline RMSE",
              ],
              ["spearman_enrichment", zh ? "排序相关性" : "Rank correlation"],
            ]
              .filter(([key]) => Number.isFinite(metrics[key]))
              .map(([key, label]) => (
                <span key={key}>
                  {label}
                  <strong>{metrics[key].toFixed(3)}</strong>
                </span>
              ))}
          </div>
          <p className="dataset-model-reading-help">
            {zh
              ? "误差越低越好；简单基线为仅使用训练集均值的预测。富集预测不代表结合亲和力，仍需实验验证。"
              : "Lower error is better. The simple baseline predicts the training-set mean. Enrichment predictions are not binding affinity and still require experiments."}
          </p>
        </section>
      )}
    </div>
  );
}
