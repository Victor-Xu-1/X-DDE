import { useState } from "react";
import { artifactUrl } from "../api";
import { StateForm } from "../chemistry/StateForm";
import { StructureViewer } from "../viewer/StructureViewer";
import type { MoleculeRef } from "../research/types";
import type { Job, Language } from "../types";
import type { AdmetResult } from "./types";
import { EndpointTable } from "./EndpointTable";
import { failureReason } from "./labels";
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
      <div className="admet-results-layout">
        <div
          className="admet-records"
          role="group"
          aria-label={zh ? "候选分子" : "Candidate molecules"}
        >
          {result.rows.map((row) => (
            <button
              type="button"
              key={row.record}
              aria-pressed={current?.record === row.record}
              onClick={() => setSelected(row.record)}
            >
              <strong>
                #{row.record + 1} · {row.name}
              </strong>
              <span>
                {row.status === "predicted"
                  ? zh
                    ? "已得到模型预测"
                    : "Model predictions available"
                  : failureReason(row.reason, zh)}
              </span>
              {row.duplicate_of_record !== null && (
                <small>
                  {zh ? "与记录相同" : "Same representation as record"} #
                  {row.duplicate_of_record + 1}
                </small>
              )}
            </button>
          ))}
        </div>
        <div className="admet-selected-record">
          {current && (
            <>
              <h3>
                #{current.record + 1} · {current.name}
              </h3>
              {current.preview && (
                <StructureViewer
                  urls={[artifactUrl(job.id, current.preview)]}
                  language={language}
                />
              )}
              {current.status === "predicted" ? (
                <>
                  {current.reference && onCreated && (
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
                  <EndpointTable
                    key={job.id + ":" + current.record}
                    language={language}
                    result={result}
                    row={current}
                  />
                </>
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
