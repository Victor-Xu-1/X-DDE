import { useState } from "react";
import type { Job, Language } from "../types";
import type { DatasetResult } from "./types";
import { CandidateView } from "./CandidateView";
import { ResearchTable } from "./ResearchTable";
import { DatasetCharts } from "./DatasetCharts";
import { DefinitionView } from "./DefinitionView";
import { resultCountLabels as names } from "./result-labels";
import { ResearchDownloads } from "./ResearchDownloads";
import { chartArtifacts } from "./chart-documents";
import { countSummary } from "./count-summary";
import { IndexedLibraryResults } from "./IndexedLibraryResults";

export function DatasetResults({
  job,
  result,
  language,
  onCreated,
}: {
  job: Job;
  result: DatasetResult;
  language: Language;
  onCreated?(job: Job): void;
}) {
  const zh = language === "zh",
    [tab, setTab] = useState("results"),
    comparison = String(result.metadata.chosen_comparison ?? ""),
    [chosen, setChosen] = useState(comparison),
    available = result.metadata.comparisons as
      { id: string; selection: string; reference: string }[] | undefined;
  const tableView = result.artifacts.some(
    (file) => file.role === "del_comparison_evidence",
  )
    ? "enrichment"
    : result.artifacts.some((file) => file.role === "compound_count_matrix")
      ? "counts"
      : result.data_kind === "decoded"
        ? "decoded"
        : result.artifacts.some((file) => file.role === "del_series_counts")
          ? "series"
          : result.artifacts.some(
                (file) => file.role === "reported_followup_measurements",
              )
            ? "followup"
            : result.data_kind === "library"
              ? "library"
              : result.data_kind === "index"
                ? "index"
                : null;
  const hasCharts =
    chartArtifacts(result.artifacts).length > 0 ||
    countSummary(result) !== null;
  const hasPrimary = Boolean(
    tableView || result.candidates.length || result.data_kind === "definition",
  );
  const showTabs = hasCharts && hasPrimary;
  const hasComparisons =
    Boolean(available?.length) && tableView === "enrichment";
  const stats = Object.entries(result.counts)
    .filter(
      ([key, value]) =>
        names[key] &&
        key !== "shards" &&
        !(result.operation === "del_count" && key === "member_sample_pairs") &&
        !(key === "unresolved_structures" && value === 0),
    )
    .slice(0, 5);
  return (
    <div className="dataset-results">
      <div className="dataset-result-metrics">
        <span className="dataset-status-complete sr-only">
          {zh ? "已完成" : "Complete"}
        </span>
        {stats.map(([key, value]) => (
          <div key={key}>
            <span>{names[key][zh ? 0 : 1]}</span>
            <strong>{value.toLocaleString()}</strong>
          </div>
        ))}
        <ResearchDownloads
          jobId={job.id}
          artifacts={result.artifacts}
          language={language}
        />
      </div>
      {result.operation === "del_count" &&
        result.metadata.umi_method !== "raw" &&
        !result.metadata.umi_integrity && (
          <p className="field-help" role="status">
            {zh
              ? "此历史计数未评估 UMI 完整性；原始结果保留。重新解码并计数后，再用于 UMI 比较。"
              : "UMI completeness was not assessed for these historical counts. The original result is retained; decode and count again before UMI comparisons."}
          </p>
        )}
      {(showTabs || hasComparisons) && (
        <div className="dataset-result-tabs">
          {showTabs && (
            <>
              <button
                type="button"
                aria-pressed={tab === "results"}
                onClick={() => setTab("results")}
              >
                {zh ? "结果探索" : "Results"}
              </button>
              <button
                type="button"
                aria-pressed={tab === "quality"}
                onClick={() => setTab("quality")}
              >
                {zh ? "图表与质量" : "Charts and quality"}
              </button>
            </>
          )}
          {available && available.length > 0 && tableView === "enrichment" && (
            <select
              value={chosen}
              aria-label={zh ? "选择比较" : "Comparison"}
              onChange={(e) => setChosen(e.target.value)}
            >
              {available.map((item) => (
                <option value={item.id} key={item.id}>
                  {item.selection} / {item.reference}
                </option>
              ))}
            </select>
          )}
        </div>
      )}
      {tableView === "enrichment" &&
        result.metadata.minimum_supporting_samples != null && (
          <p className="field-help">
            {zh ? "优先条件：" : "Prioritization: "}
            {zh ? "靶点计数 ≥ " : "target counts ≥ "}
            {String(result.metadata.minimum_counts)}
            {" · "}
            {zh ? "富集 ≥ " : "enrichment ≥ "}
            {String(result.metadata.minimum_enrichment)}×{" · "}
            {zh ? "支持样本 ≥ " : "supporting samples ≥ "}
            {String(result.metadata.minimum_supporting_samples)}
            {result.metadata.count_unit === "reported_counts" &&
              (zh
                ? "。外部报告计数，处理方法未独立核实；区间仅为计数模型估计。"
                : ". Externally reported counts; processing unverified. Intervals are count-model estimates only.")}
          </p>
        )}
      {showTabs && tab === "quality" ? (
        <DatasetCharts job={job} result={result} language={language} />
      ) : (
        <>
          {result.candidates.length > 0 && !tableView && (
            <CandidateView
              job={job}
              result={result}
              language={language}
              onCreated={onCreated}
            />
          )}
          {(tableView === "index" || tableView === "library") && (
            <IndexedLibraryResults
              key={job.id}
              jobId={job.id}
              language={language}
              view={tableView}
            />
          )}
          {tableView && tableView !== "index" && tableView !== "library" && (
            <ResearchTable
              key={job.id}
              jobId={job.id}
              view={tableView}
              comparison={chosen}
              language={language}
              defaultPrioritized={
                tableView === "enrichment" &&
                Number(result.metadata.minimum_supporting_samples ?? 1) > 1
              }
            />
          )}
          {result.candidates.length > 0 && tableView && (
            <details className="dataset-structure-details">
              <summary>{zh ? "查看候选结构" : "Candidate structures"}</summary>
              <CandidateView
                job={job}
                result={result}
                language={language}
                onCreated={onCreated}
              />
            </details>
          )}
          {result.data_kind === "definition" && (
            <DefinitionView job={job} result={result} language={language} />
          )}
          {!tableView &&
            !result.candidates.length &&
            result.data_kind !== "definition" &&
            hasCharts && (
              <DatasetCharts job={job} result={result} language={language} />
            )}
        </>
      )}
      {result.warnings.length > 0 && (
        <details className="dataset-method-note">
          <summary>
            {zh ? "结果需要注意的事项" : "Result considerations"} ·{" "}
            {result.warnings.length}
          </summary>
          {result.warnings.map((text, index) => (
            <p key={index}>{text}</p>
          ))}
        </details>
      )}
    </div>
  );
}
