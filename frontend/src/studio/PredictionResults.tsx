import { componentsOf } from "../operations/types";
import { ConfidencePanel } from "../operations/ConfidencePanel";
import { TaskDetail } from "../TaskDetail";
import { CandidatePanel } from "./CandidatePanel";
import { AnalysisGrid } from "./AnalysisGrid";
import { StructureViewer } from "../viewer/StructureViewer";
import { translator } from "../i18n";
import { useTaskLabel } from "../examples/useTaskLabel";
import type { PredictionWorkspaceProps } from "./prediction-workspace";
export type PredictionResultsProps = Pick<
  PredictionWorkspaceProps,
  | "language"
  | "job"
  | "detail"
  | "detailError"
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
>;
export function PredictionResults(p: PredictionResultsProps) {
  const zh = p.language === "zh",
    t = translator(p.language),
    taskLabel = useTaskLabel(p.job, p.language);
  return (
    <div className="prediction-workspace task-workspace is-result">
      <div className="workbench-columns result-columns">
        <div className="candidate-column">
          <h2 className="result-task-name">
            {taskLabel}{" "}
            <span className={"status " + p.job?.status}>
              {p.job ? t(p.job.status) : ""}
            </span>
          </h2>
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
        </div>
        <div className="viewer-column">
          <StructureViewer
            urls={p.urls}
            language={p.language}
            focusResidue={p.focusResidue}
            comparison={p.compared.length > 1}
          />
        </div>
      </div>
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

      {p.job &&
        p.candidate &&
        (!("parameters" in p.job.request) ||
          p.job.request.parameters.atom_confidence !== false) && (
          <details className="confidence-details">
            <summary>
              {zh
                ? "详细置信度分析（PAE / PDE）"
                : "Detailed confidence analysis (PAE / PDE)"}
            </summary>
            <ConfidencePanel
              jobId={p.job.id}
              candidate={p.candidate.id}
              language={p.language}
            />
          </details>
        )}
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
