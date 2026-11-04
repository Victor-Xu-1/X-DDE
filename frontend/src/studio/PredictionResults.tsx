import { StructureWorkbench } from "../presentation/StructureWorkbench";
import { componentsOf } from "../operations/types";
import { PredictionConfidenceCard } from "../presentation/PredictionConfidenceCard";
import { ConfidencePanel } from "../operations/ConfidencePanel";
import { TaskDetail } from "../TaskDetail";
import { CandidatePanel } from "./CandidatePanel";
import { AnalysisGrid } from "./AnalysisGrid";
import { StructureViewer } from "../viewer/StructureViewer";
import { translator } from "../i18n";
import { useTaskLabel } from "../examples/useTaskLabel";
import type { PredictionWorkspaceProps } from "./prediction-workspace";
import { PredictionSamples } from "../presentation/PredictionSamples";
import { PredictionResultHeader } from "../presentation/PredictionResultHeader";
import { useCallback, useState } from "react";
import type {
  ConfidenceBinding,
  ConfidenceInspection,
} from "../viewer/confidence-types";
export type PredictionResultsProps = Pick<
  PredictionWorkspaceProps,
  | "language"
  | "job"
  | "detail"
  | "detailError"
  | "retryAvailable"
  | "analysis"
  | "loadingAnalysis"
  | "analysisError"
  | "onRetry"
  | "candidate"
  | "onCandidate"
  | "urls"
  | "compared"
  | "onCompare"
  | "focusResidue"
  | "onResidue"
  | "onChanged"
> & { onHistory?(): void };
export function PredictionResults(p: PredictionResultsProps) {
  const selectedKey = `${p.job?.id}:${p.candidate?.id}`;
  const [annotation, setAnnotation] = useState<{
    key: string;
    value: ConfidenceBinding | null;
  }>();
  const [inspection, setInspection] = useState<{
    key: string;
    value: ConfidenceInspection | null;
  }>();
  const [residueSelection, setResidueSelection] = useState<{
    key: string;
    value: string[];
  }>();
  const [tokenSelection, setTokenSelection] = useState<{
    key: string;
    tokens: number[];
    nonce: number;
  } | null>(null);
  const [actualTokens, setActualTokens] = useState<{
    key: string;
    tokens: number[];
  } | null>(null);
  const receiveBinding = useCallback(
    (value: ConfidenceBinding | null) =>
      setAnnotation({ key: selectedKey, value }),
    [selectedKey],
  );
  const mapped = inspection?.key === selectedKey ? inspection.value : null;
  const zh = p.language === "zh",
    t = translator(p.language),
    taskLabel = useTaskLabel(p.job, p.language);
  const confidenceAvailable =
    p.job &&
    p.candidate &&
    (!("parameters" in p.job.request) ||
      p.job.request.parameters.atom_confidence !== false);
  const samples = (p.analysis?.candidates ?? []).map((row) => {
    const match = /^(?:seed-(\d+)-)?sample-(\d+)(?:-[0-9a-f]{12})?$/.exec(
      row.id,
    );
    return {
      id: row.id,
      artifact: row.artifact,
      seed: match?.[1] ? Number(match[1]) : null,
      sample: match ? Number(match[2]) : null,
      metrics: [
        { name: "Ranking score", value: row.ranking_score, unit: "" },
        { name: "pTM", value: row.ptm, unit: "0–1" },
        { name: "ipTM", value: row.iptm, unit: "0–1" },
        { name: "pLDDT", value: row.plddt, unit: "0–100" },
      ],
    };
  });
  return (
    <div className="prediction-workspace prediction-result task-workspace is-result">
      {p.job && (
        <PredictionResultHeader
          job={p.job}
          title={taskLabel}
          language={p.language}
          onHistory={p.onHistory}
        />
      )}
      {p.job && p.candidate && (
        <PredictionSamples
          job={p.job.id}
          rows={samples}
          selected={p.candidate.id}
          language={p.language}
          onSelect={(id) => {
            p.onCompare([]);
            p.onCandidate(id);
          }}
        />
      )}
      <StructureWorkbench
        preview={
          <div className="viewer-column">
            <StructureViewer
              urls={p.urls}
              language={p.language}
              focusResidue={p.focusResidue}
              comparison={p.compared.length > 1}
              confidence={
                p.compared.length > 1 || annotation?.key !== selectedKey
                  ? null
                  : annotation?.value
              }
              onConfidenceInspection={(value) =>
                setInspection({ key: selectedKey, value })
              }
              confidenceSelection={
                mapped?.key === tokenSelection?.key ? tokenSelection : null
              }
              onConfidenceSelected={setActualTokens}
              onResiduesSelected={(value) =>
                setResidueSelection({ key: selectedKey, value })
              }
            />
          </div>
        }
      >
        {confidenceAvailable && p.job && p.candidate ? (
          <ConfidencePanel
            jobId={p.job.id}
            candidate={p.candidate.id}
            language={p.language}
            onBinding={receiveBinding}
            inspection={p.compared.length > 1 ? null : mapped}
            selectedResidues={
              residueSelection?.key === selectedKey
                ? residueSelection.value
                : []
            }
            selectedTokens={
              actualTokens?.key === mapped?.key ? actualTokens?.tokens : []
            }
            onTokens={(tokens) => {
              if (mapped)
                setTokenSelection({
                  key: mapped.key,
                  tokens,
                  nonce: Date.now(),
                });
            }}
          />
        ) : (
          <PredictionConfidenceCard
            title={zh ? "预测对齐误差" : "Predicted aligned error"}
          >
            <p>
              {zh
                ? "此构象尚无可显示的逐原子置信度。"
                : "No atom-level confidence is available for this conformer."}
            </p>
          </PredictionConfidenceCard>
        )}
      </StructureWorkbench>
      <section className="prediction-conformer-table">
        <CandidatePanel
          key={p.job?.id || "empty"}
          job={p.job}
          analysis={p.analysis}
          loading={p.loadingAnalysis}
          error={p.analysisError}
          onRetry={p.onRetry}
          language={p.language}
          selected={p.candidate?.id ?? null}
          onSelect={p.onCandidate}
          compared={p.compared}
          onCompare={p.onCompare}
        />
      </section>
      <details className="preview-properties">
        <summary>
          {zh ? "性质与结构指标" : "Properties and structure metrics"}
        </summary>
        <AnalysisGrid
          analysis={p.analysis}
          candidate={p.candidate}
          language={p.language}
          onResidue={p.onResidue}
          components={componentsOf(p.job?.request)}
        />
      </details>

      {p.job && (
        <details className="execution-detail">
          <summary>
            {zh ? "任务结果与文件" : "Task results and files"}{" "}
            <span className={"status " + p.job.status}>{t(p.job.status)}</span>
          </summary>
          <TaskDetail
            key={p.job.id}
            language={p.language}
            job={p.job}
            detail={p.detail}
            failed={p.detailError}
            retryAvailable={p.retryAvailable}
            showPredictionInput={false}
            onChange={p.onChanged}
          />
        </details>
      )}

      {p.job?.status === "succeeded" && p.analysis && (
        <div className="prediction-downloads">
          <a href={"/api/jobs/" + p.job.id + "/report"} download>
            {zh ? "下载研究报告（HTML）" : "Download research report (HTML)"}
          </a>
        </div>
      )}
    </div>
  );
}
