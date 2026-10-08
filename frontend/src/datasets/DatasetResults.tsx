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
  const hasCharts = chartArtifacts(result.artifacts).length > 0;
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
          {tableView === "index" && (
            <IndexedLibraryResults
              key={job.id}
              jobId={job.id}
              language={language}
            />
          )}
          {tableView && tableView !== "index" && (
            <ResearchTable
              jobId={job.id}
              view={tableView}
              comparison={chosen}
              language={language}
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
