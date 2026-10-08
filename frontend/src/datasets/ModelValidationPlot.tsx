import type { Language } from "../types";
import { InteractivePlot } from "../presentation/plots/InteractivePlot";
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
  const zh = language === "zh";
  const values = points.flatMap((p) => [p.observed, p.predicted]);
  const min = Math.min(0, ...values),
    max = Math.max(1, ...values);
  const compared =
    Number.isFinite(metrics.rmse_log1p_enrichment) &&
    Number.isFinite(metrics.mean_baseline_rmse);
  const improvesBaseline =
    compared && metrics.rmse_log1p_enrichment < metrics.mean_baseline_rmse;
  return (
    <div className="dataset-model-validation">
      <InteractivePlot
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
        data={[
          {
            type: "scatter",
            mode: "markers",
            x: points.map((p) => p.observed),
            y: points.map((p) => p.predicted),
            marker: { color: "#7864dd", size: 6, opacity: 0.7 },
            hovertemplate:
              (zh ? "观察" : "Observed") +
              ": %{x:.4g}<br>" +
              (zh ? "预测" : "Predicted") +
              ": %{y:.4g}<extra></extra>",
          },
        ]}
        layout={{
          showlegend: false,
          xaxis: {
            title: {
              text: zh ? "观察 log(1＋富集)" : "Observed log(1+enrichment)",
            },
          },
          yaxis: {
            title: {
              text: zh ? "预测 log(1＋富集)" : "Predicted log(1+enrichment)",
            },
            scaleanchor: "x",
            scaleratio: 1,
          },
          shapes: [
            {
              type: "line",
              x0: min,
              y0: min,
              x1: max,
              y1: max,
              line: { color: "#9facbf", width: 1, dash: "dot" },
            },
          ],
        }}
      />
      <p className="field-help">
        {zh
          ? "灰色虚线：预测与观察值一致。"
          : "Gray dotted line: equal predicted and observed values."}
      </p>
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
