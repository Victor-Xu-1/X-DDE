import { useState } from "react";
import { artifactUrl } from "../api";
import { StateForm } from "../chemistry/StateForm";
import type { MoleculeRef } from "../research/types";
import type { Job, Language } from "../types";
import type { AdmetResult } from "./types";
import { EndpointTable } from "./EndpointTable";
import { failureReason, commonEndpoints, endpointName } from "./labels";
import { AdmetRecordTable } from "./AdmetRecordTable";
import { MolecularPreview } from "../presentation/MolecularPreview";
import { MetricScatter } from "../presentation/MetricScatter";
import "./admet.css";

export function AdmetResults({
  job,
  result,
  language,
  onCreated,
}: {
  job: Job;
  result: AdmetResult;
  language: Language;
  onCreated?(job: Job): void;
}) {
  const zh = language === "zh",
    [selected, setSelected] = useState(
      result.rows.find((row) => row.status === "predicted")?.record ??
        result.rows[0]?.record,
    ),
    [next, setNext] = useState<MoleculeRef | null>(null);
  if (next && onCreated)
    return (
      <section>
        <button
          className="secondary-button"
          type="button"
          onClick={() => setNext(null)}
        >
          {zh ? "返回性质预测" : "Back to predictions"}
        </button>
        <StateForm
          language={language}
          onCreated={onCreated}
          initialMolecule={next}
        />
      </section>
    );
  const current =
    result.rows.find((row) => row.record === selected) ?? result.rows[0];
  const plotMetrics = result.endpoints
    .filter((endpoint) => commonEndpoints.has(endpoint.id))
    .map((endpoint) => ({
      key: endpoint.id,
      label:
        endpointName(endpoint, zh) +
        " (" +
        (endpoint.task_type === "classification" ? "0–1" : endpoint.unit) +
        ")",
      value: (row: AdmetResult["rows"][number]) =>
        row.status === "predicted" ? row.predictions[endpoint.id] : null,
    }));
  return (
    <section
      className="admet-results"
      aria-label={zh ? "性质与早期安全性预测结果" : "ADMET prediction results"}
    >
      <div className="admet-result-toolbar">
        <p role="status">
          {zh ? "已预测" : "Predicted"} {result.predicted_count} /{" "}
          {result.rows.length}
        </p>
        <a
          className="secondary-button"
          href={artifactUrl(job.id, "predictions.csv")}
          download
        >
          {zh ? "下载预测表" : "Download prediction table"}
        </a>
      </div>
      <div className="result-master-detail">
        <div className="result-inspector">
          <AdmetRecordTable
            result={result}
            language={language}
            selected={current?.record}
            onSelect={(row) => setSelected(row.record)}
          />
          <MetricScatter
            rows={result.rows}
            metrics={plotMetrics}
            language={language}
            label={zh ? "候选性质对比" : "Candidate property landscape"}
            rowId={(row) => String(row.record)}
            rowLabel={(row) => row.name}
            selected={String(current?.record)}
            onSelect={(row) => setSelected(row.record)}
          />
        </div>
        <div className="result-inspector">
          {current && (
            <>
              <header>
                <h3>
                  #{current.record + 1} · {current.name}
                </h3>
                {current.status === "predicted" &&
                  current.reference &&
                  onCreated && (
                    <button
                      className="secondary-button"
                      type="button"
                      onClick={() => setNext(current.reference!)}
                    >
                      {zh
                        ? "复用原始分子 → 分子准备"
                        : "Reuse original molecule → preparation"}
                    </button>
                  )}
              </header>
              {current.preview && (
                <MolecularPreview
                  source={current.smiles ? { smiles: current.smiles } : null}
                  label={current.name}
                  urls={[artifactUrl(job.id, current.preview)]}
                  language={language}
                  defaultView="3d"
                />
              )}
              {current.status === "predicted" ? (
                <EndpointTable
                  key={job.id + ":" + current.record}
                  language={language}
                  result={result}
                  row={current}
                />
              ) : (
                <p role="status">{failureReason(current.reason, zh)}</p>
              )}
            </>
          )}
        </div>
      </div>
    </section>
  );
}
