import type { Language } from "../types";
import { ResearchTabs } from "../presentation/ResearchTabs";
import { MetricScatter } from "../presentation/MetricScatter";
import { AdmetRecordTable } from "./AdmetRecordTable";
import { commonEndpoints, endpointName, endpointUnit } from "./labels";
import type { AdmetResult, AdmetRow } from "./types";
import { EndpointTable } from "./EndpointTable";

export function AdmetCandidateViews({
  result,
  language,
  row,
  onSelect,
}: {
  result: AdmetResult;
  language: Language;
  row: AdmetRow;
  onSelect(row: AdmetRow): void;
}) {
  const zh = language === "zh";
  const selected = row.record;
  const predictions = {
    id: "predictions",
    label: zh ? "预测性质" : "Predictions",
    content:
      row.status === "predicted" ? (
        <EndpointTable result={result} row={row} language={language} />
      ) : (
        <p className="field-help">
          {zh
            ? "选择已有有效预测的分子后查看各项终点。"
            : "Choose a molecule with valid predictions to inspect its endpoints."}
        </p>
      ),
  };
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
      aria-label={
        zh ? "预测与候选比较" : "Predictions and candidate comparison"
      }
    >
      {result.rows.length === 1 ? (
        predictions.content
      ) : (
        <ResearchTabs
          label={zh ? "候选视图" : "Candidate views"}
          tabs={
            metrics.length > 1
              ? [predictions, table, landscape]
              : [predictions, table]
          }
        />
      )}
    </section>
  );
}
