import type { Language } from "../types";
import { ResearchTabs } from "../presentation/ResearchTabs";
import { MetricScatter } from "../presentation/MetricScatter";
import { AdmetRecordTable } from "./AdmetRecordTable";
import { commonEndpoints, endpointName, endpointUnit } from "./labels";
import type { AdmetResult, AdmetRow } from "./types";

export function AdmetCandidateViews({
  result,
  language,
  selected,
  onSelect,
}: {
  result: AdmetResult;
  language: Language;
  selected: number;
  onSelect(row: AdmetRow): void;
}) {
  const zh = language === "zh";
  const metrics = result.endpoints
    .filter((endpoint) => commonEndpoints.has(endpoint.id))
    .map((endpoint) => ({
      key: endpoint.id,
      label:
        endpointName(endpoint, zh) + " (" + endpointUnit(endpoint, zh) + ")",
      value: (row: AdmetRow) =>
        row.status === "predicted" ? row.predictions[endpoint.id] : null,
    }));
  const table = {
    id: "molecules",
    label: zh ? "候选分子" : "Candidate molecules",
    count: result.rows.length,
    content: (
      <AdmetRecordTable
        result={result}
        language={language}
        selected={selected}
        onSelect={onSelect}
      />
    ),
  };
  const landscape = {
    id: "landscape",
    label: zh ? "性质分布" : "Property landscape",
    content: (
      <MetricScatter
        rows={result.rows}
        metrics={metrics}
        language={language}
        label={zh ? "候选性质对比" : "Candidate property landscape"}
        rowId={(row) => String(row.record)}
        rowLabel={(row) => row.name}
        selected={String(selected)}
        onSelect={onSelect}
      />
    ),
  };
  return (
    <section
      className="admet-candidates"
      aria-label={zh ? "候选比较" : "Candidate comparison"}
    >
      <ResearchTabs
        label={zh ? "候选视图" : "Candidate views"}
        tabs={
          result.rows.length > 1 && metrics.length > 1
            ? [table, landscape]
            : [table]
        }
      />
    </section>
  );
}
