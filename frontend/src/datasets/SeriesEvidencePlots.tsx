import { useState } from "react";
import type { Language } from "../types";
import type { SeriesRow } from "./chart-documents";
import { MonosynthonPlot } from "./MonosynthonPlot";
import { SeriesEnrichmentPlot } from "./SeriesEnrichmentPlot";

export function SeriesEvidencePlots({
  series,
  totalSeries,
  language,
}: {
  series: SeriesRow[];
  totalSeries?: number;
  language: Language;
}) {
  const [view, setView] = useState("di");
  const zh = language === "zh";
  return (
    <div className="dataset-series-evidence">
      <div
        className="dataset-result-tabs"
        aria-label={zh ? "系列视图" : "Series view"}
      >
        <button
          type="button"
          aria-pressed={view === "di"}
          onClick={() => setView("di")}
        >
          {zh ? "双砌块热图" : "Disynthon map"}
        </button>
        <button
          type="button"
          aria-pressed={view === "mono"}
          onClick={() => setView("mono")}
        >
          {zh ? "单砌块富集" : "Monosynthons"}
        </button>
      </div>
      {view === "di" ? (
        <SeriesEnrichmentPlot
          series={series}
          totalSeries={totalSeries}
          language={language}
        />
      ) : (
        <MonosynthonPlot series={series} language={language} />
      )}
      {view === "mono" &&
        totalSeries !== undefined &&
        totalSeries > series.length && (
          <p className="field-help">
            {zh
              ? "此图表是系列摘录；完整系列可在结果表中检索和下载。"
              : "This chart is a series excerpt. Search and download the complete series in the results table."}
          </p>
        )}
    </div>
  );
}
