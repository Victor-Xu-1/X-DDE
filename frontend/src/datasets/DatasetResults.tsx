import { useState } from "react";
import { artifactUrl } from "../api";
import type { Job, Language } from "../types";
import type { DatasetResult } from "./types";
import { CandidateView } from "./CandidateView";
import { ResearchTable } from "./ResearchTable";
import { DatasetCharts } from "./DatasetCharts";
import { DefinitionView } from "./DefinitionView";

const names: Record<string, [string, string]> = {
  source_records: ["原始记录", "Source records"],
  valid_records: ["有效记录", "Valid records"],
  unique_compounds: ["独立结构", "Unique structures"],
  duplicate_chemical_records: ["重复结构记录", "Duplicate chemical records"],
  rejected_records: ["需核查记录", "Rejected records"],
  indexed: ["索引分子", "Indexed molecules"],
  searched_rows: ["检索分子", "Searched molecules"],
  returned: ["候选成员", "Candidates"],
  retained_3d: ["三维候选", "3D candidates"],
  selected: ["选择成员", "Selected members"],
  docked: ["完成对接", "Docked"],
  failed: ["未完成成员", "Failed members"],
  input_reads: ["测序读段", "Input reads"],
  decoded_reads: ["解码读段", "Decoded reads"],
  rejected_reads: ["未解码读段", "Rejected reads"],
  counted_reads: ["计数读段", "Counted reads"],
  observed_members: ["观察成员", "Observed members"],
  samples: ["样本", "Samples"],
  comparisons: ["比较", "Comparisons"],
  series: ["砌块组合", "Series"],
  enumerated: ["解析结构", "Resolved structures"],
  theoretical_members: ["理论成员", "Theoretical members"],
  building_blocks: ["砌块", "Building blocks"],
  libraries: ["库", "Libraries"],
  training: ["训练成员", "Training members"],
  heldout: ["留出成员", "Held-out members"],
  reported: ["报告测量", "Reported measurements"],
  matched: ["关联成员", "Linked members"],
};
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
            : null;
  const stats = Object.entries(result.counts)
      .filter(([key]) => names[key])
      .slice(0, 5),
    downloads = result.artifacts.filter((file) =>
      ["csv", "sdf"].includes(file.format),
    );
  return (
    <div className="dataset-results">
      <div className="dataset-result-heading">
        <h2>{job.request.name}</h2>
        <span className="dataset-status-complete">
          {zh ? "已完成" : "Complete"}
        </span>
        <details className="dataset-download-menu">
          <summary>{zh ? "下载研究结果" : "Download results"}</summary>
          <div>
            {downloads.map((file) => (
              <a key={file.name} href={artifactUrl(job.id, file.name)}>
                {file.name.endsWith(".sdf")
                  ? zh
                    ? "分子结构 · "
                    : "Structures · "
                  : zh
                    ? "研究表格 · "
                    : "Table · "}
                {file.name}
              </a>
            ))}
          </div>
        </details>
      </div>
      <div className="dataset-result-metrics">
        {stats.map(([key, value]) => (
          <div key={key}>
            <span>{names[key][zh ? 0 : 1]}</span>
            <strong>{value.toLocaleString()}</strong>
          </div>
        ))}
      </div>
      <div className="dataset-result-tabs">
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
      {tab === "quality" ? (
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
          {tableView && (
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
            result.data_kind !== "definition" && (
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
