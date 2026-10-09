import { Bars } from "./CountBars";
import { SequencingQualityPlot } from "./SequencingQualityPlot";
import { ModelValidationPlot } from "./ModelValidationPlot";
import { SampleCorrelationPlot } from "./SampleCorrelationPlot";
import { SeriesEnrichmentPlot } from "./SeriesEnrichmentPlot";
import { useChartDocuments } from "./useChartDocuments";
import { countSummary } from "./count-summary";
import { CountEvidencePlot } from "./CountEvidencePlot";
import type { Job, Language } from "../types";
import type { DatasetResult } from "./types";

export function DatasetCharts({
  job,
  result,
  language,
}: {
  job: Job;
  result: DatasetResult;
  language: Language;
}) {
  const zh = language === "zh",
    { documents, status, available, retry } = useChartDocuments(
      job.id,
      result.artifacts,
    );
  const nativeCounts = countSummary(result);
  if (!available)
    return nativeCounts ? (
      <CountEvidencePlot rows={nativeCounts} language={language} />
    ) : null;
  if (status === "loading")
    return (
      <div className="dataset-calculation-state" role="status" aria-busy="true">
        <strong>{zh ? "正在读取图表…" : "Loading charts…"}</strong>
      </div>
    );
  if (status === "error")
    return (
      <div className="dataset-calculation-state" role="alert">
        <span>
          {zh
            ? "图表暂时无法读取。原始研究结果仍可下载。"
            : "Charts could not be loaded. The original research results remain downloadable."}
        </span>
        <button type="button" className="secondary-button" onClick={retry}>
          {zh ? "重试" : "Retry"}
        </button>
      </div>
    );
  const sequencing = documents.sequencing_quality,
    count = documents.count_quality,
    barcode = documents.barcode_quality,
    series = documents.del_series_visualization,
    model =
      documents.independent_holdout_evaluation ??
      documents.research_model_application;
  return (
    <div className="dataset-chart-grid">
      {sequencing && (
        <>
          <Bars
            language={language}
            title={zh ? "读段质量与解码" : "Read quality and decoding"}
            rows={[
              { name: zh ? "输入读段" : "Input", value: sequencing.reads },
              { name: zh ? "完成解码" : "Decoded", value: sequencing.decoded },
              {
                name: zh ? "未解码" : "Rejected",
                value: sequencing.reads - sequencing.decoded,
              },
            ]}
          />
          <SequencingQualityPlot
            values={sequencing.mean_quality}
            language={language}
          />
        </>
      )}
      {count && (
        <>
          <Bars
            language={language}
            title={zh ? "样本测序深度" : "Sample sequencing depth"}
            rows={count.samples.map((row) => ({
              name: row.column,
              value: row.depth,
            }))}
          />
          <SampleCorrelationPlot data={count} language={language} />
        </>
      )}
      {barcode && (
        <Bars
          language={language}
          title={zh ? "砌块与编码覆盖" : "Building-block and barcode coverage"}
          rows={barcode.cycles.map((row) => ({
            name: row.set,
            value: row.members,
          }))}
        />
      )}
      {series && (
        <SeriesEnrichmentPlot
          series={series.series}
          totalSeries={series.total_series}
          language={language}
        />
      )}
      {model &&
        (model.heldout_predictions.length ? (
          <ModelValidationPlot
            points={model.heldout_predictions}
            metrics={result.metrics}
            language={language}
            application={Boolean(documents.research_model_application)}
          />
        ) : (
          <p className="dataset-empty">
            {zh
              ? "此结果没有可绘制的观测与预测配对。"
              : "This result has no observed/predicted pairs to plot."}
          </p>
        ))}
    </div>
  );
}
