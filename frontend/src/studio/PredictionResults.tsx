import { componentsOf } from "../operations/types";
import { TaskDetail } from "../TaskDetail";
import { CandidatePanel } from "./CandidatePanel";
import { AnalysisGrid } from "./AnalysisGrid";
import { translator } from "../i18n";
import { useTaskLabel } from "../examples/useTaskLabel";
import type { PredictionWorkspaceProps } from "./prediction-workspace";
import { PredictionResultHeader } from "../presentation/PredictionResultHeader";
import { PredictionInspection } from "./PredictionInspection";
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
  const zh = p.language === "zh",
    t = translator(p.language),
    taskLabel = useTaskLabel(p.job, p.language);
  const selectSample = (id: string) => {
    p.onCompare([]);
    p.onCandidate(id);
  };
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
      <PredictionInspection
        job={p.job}
        analysis={p.analysis}
        candidate={p.candidate}
        urls={p.urls}
        language={p.language}
        overlayCount={p.urls.length}
        focusResidue={p.focusResidue}
        onCandidate={selectSample}
      />
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
          onSelect={selectSample}
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
