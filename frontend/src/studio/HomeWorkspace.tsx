import { componentsOf, isPrediction } from "../operations/types";
import { useEffect, useState } from "react";
import { ReloadOutlined } from "@ant-design/icons";
import { TaskForm } from "../TaskForm";
import { ConfidencePanel } from "../operations/ConfidencePanel";
import { TaskDetail } from "../TaskDetail";
import { CandidatePanel } from "./CandidatePanel";
import { AnalysisGrid } from "./AnalysisGrid";
import { StructureViewer } from "../viewer/StructureViewer";
import { translator } from "../i18n";
import type {
  Analysis,
  Candidate,
  Detail,
  Health,
  Job,
  Language,
  Prediction,
  Project,
} from "../types";
import { useTaskLabel } from "../examples/useTaskLabel";
interface Props {
  active: boolean;
  resultsVersion: number;
  inputVersion?: number;
  language: Language;
  ready: boolean;
  health: Health | null;
  connectionError: boolean;
  onRefresh(): void;
  jobs: Job[];
  job: Job | null;
  detail: Detail | null;
  detailError: boolean;
  onJob(id: string): void;
  onChanged(job: Job): void;
  projects: Project[];
  projectId: string | null;
  onProject(id: string | null): void;
  analysis: Analysis | null;
  loadingAnalysis: boolean;
  analysisError: string;
  onRetry(): void;
  candidate?: Candidate;
  onCandidate(id: string): void;
  urls: string[];
  compared: string[];
  onCompare(ids: string[]): void;
  focusResidue: { residue: string; nonce: number } | null;
  onResidue(residue: string): void;
  draft: Prediction | null;
  onReuse(): void;
  onSubmit(value: Prediction, key: string): Promise<Job>;
}
export function HomeWorkspace(p: Props) {
  const taskLabel = useTaskLabel(p.job, p.language);
  const [showInput, setShowInput] = useState(
    () => !/^#task=[0-9a-f-]+$/.test(location.hash),
  );
  useEffect(() => {
    if (p.resultsVersion) setShowInput(false);
  }, [p.resultsVersion]);
  useEffect(() => {
    if (p.draft) setShowInput(true);
  }, [p.draft]);
  useEffect(() => {
    if (p.inputVersion) setShowInput(true);
  }, [p.inputVersion]);
  const zh = p.language === "zh",
    t = translator(p.language),
    showResults =
      p.active && !showInput && Boolean(p.job && isPrediction(p.job.request));
  return (
    <div
      className={`prediction-workspace task-workspace ${showResults ? "is-result" : "is-input"}`}
    >
      <h1 className="sr-only">{zh ? "结构预测" : "Structure prediction"}</h1>
      {p.connectionError && (
        <div className="error-box" role="alert">
          {t("connectionError")}{" "}
          <button onClick={p.onRefresh}>{t("refresh")}</button>
        </div>
      )}
      {p.health && (!p.health.engine.ready || p.health.worker_error) && (
        <aside className="notice engine-notice">
          <p>
            {zh
              ? "可以先填写任务；计算前请在安装与组件中完成结构预测配置。"
              : "Prepare your inputs now; complete structure prediction setup in Installation & components before calculating."}
          </p>
        </aside>
      )}
      <section className="workbench-section">
        <div
          className="workspace-mode segmented"
          role="group"
          aria-label={zh ? "工作区" : "Workspace"}
        >
          <button
            aria-pressed={showInput}
            className={showInput ? "selected" : ""}
            onClick={() => setShowInput(true)}
          >
            {zh ? "新建预测" : "New prediction"}
          </button>
          <button
            aria-pressed={!showInput}
            className={!showInput ? "selected" : ""}
            disabled={!p.job}
            onClick={() => setShowInput(false)}
          >
            {zh ? "结构与结果" : "Structure and results"}
          </button>
        </div>
        <div className="workbench-toolbar guided-toolbar">
          <label hidden={!p.projects.length}>
            {zh ? "研究项目" : "Project"}
            <select
              value={p.projectId ?? ""}
              onChange={(e) => p.onProject(e.target.value || null)}
            >
              <option value="">{zh ? "不指定项目" : "No project"}</option>
              {p.projects.map((x) => (
                <option key={x.id} value={x.id}>
                  {x.name}
                </option>
              ))}
            </select>
          </label>
          <label hidden={showInput || !p.jobs.length}>
            {zh ? "查看任务结果" : "View task results"}
            <select
              value={p.job?.id ?? ""}
              onChange={(e) => {
                if (e.target.value) {
                  p.onJob(e.target.value);
                  setShowInput(false);
                }
              }}
            >
              <option value="">{zh ? "选择已有任务" : "Choose a task"}</option>
              {p.jobs.map((x) => (
                <option key={x.id} value={x.id}>
                  {x.request.name} · {t(x.status)}
                </option>
              ))}
            </select>
          </label>
          {p.job &&
            (!p.job.request.operation ||
              p.job.request.operation === "predict") && (
              <button
                className="quickstart"
                onClick={() => {
                  p.onReuse();
                  setShowInput(true);
                }}
              >
                <ReloadOutlined />{" "}
                {zh ? "使用这份历史输入" : "Use these historical inputs"}
              </button>
            )}
        </div>
        <div
          className={
            "workbench-columns" + (showResults ? " result-columns" : "")
          }
        >
          <div className="input-column" hidden={!showInput}>
            <TaskForm
              key={p.inputVersion ?? 0}
              language={p.language}
              ready={p.ready}
              abagAvailable={Boolean(p.health?.engine.models?.abag)}
              initialRequest={p.draft}
              onSubmit={async (value, key) => {
                const created = await p.onSubmit(value, key);
                setShowInput(false);
                return created;
              }}
            />
          </div>
          {showResults && (
            <>
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
            </>
          )}
        </div>
        {showResults && (
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
        )}
      </section>
      {showResults &&
        p.job &&
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
      {showResults && p.job && (
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
    </div>
  );
}
