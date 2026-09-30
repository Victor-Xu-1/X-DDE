import { componentsOf } from "../operations/types";
import { useEffect, useState } from "react";
import {
  CheckCircleOutlined,
  CloseCircleOutlined,
  ReloadOutlined,
} from "@ant-design/icons";
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
interface Props {
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
  onSubmit(value: Prediction, key: string): Promise<void>;
}
export function HomeWorkspace(p: Props) {
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
    t = translator(p.language);
  return (
    <>
      <header className="studio-intro">
        <div>
          <h1>{zh ? "X-DDE 药物结构工作台" : "X-DDE Structure Workbench"}</h1>
          <p>
            {zh
              ? "选一种任务，填入分子，选择运行方案。完成后直接查看三维结构与结果。"
              : "Choose a task, enter molecules and pick a preset. Inspect structures and results when finished."}
          </p>
        </div>
        <div className={"ready-indicator " + (p.ready ? "ok" : "off")}>
          {p.ready ? <CheckCircleOutlined /> : <CloseCircleOutlined />}
          {!p.health
            ? t("connecting")
            : p.ready
              ? t("ready")
              : t("unavailable")}
        </div>
      </header>
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
              ? "计算环境尚未就绪。你可以先准备输入，再到运行状态查看需要配置的组件。"
              : "The compute environment is not ready. You can prepare inputs now and check Runtime status for required components."}
          </p>
          <details>
            <summary>
              {zh ? "查看环境诊断" : "View environment diagnostics"}
            </summary>
            <p>{p.health.worker_error || p.health.engine.reason}</p>
          </details>
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
          <label>
            {zh ? "研究项目" : "Project"}
            <select
              value={p.projectId ?? ""}
              onChange={(e) => p.onProject(e.target.value || null)}
            >
              <option value="">
                {zh
                  ? "全部任务（新任务不分组）"
                  : "All tasks (new tasks ungrouped)"}
              </option>
              {p.projects.map((x) => (
                <option key={x.id} value={x.id}>
                  {x.name}
                </option>
              ))}
            </select>
          </label>
          <label>
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
                <ReloadOutlined /> {zh ? "复用此任务输入" : "Reuse inputs"}
              </button>
            )}
        </div>
        <div className="workbench-columns">
          <div className="input-column" hidden={!showInput}>
            <TaskForm
              language={p.language}
              ready={p.ready}
              abagAvailable={Boolean(p.health?.engine.models?.abag)}
              initialRequest={p.draft}
              onSubmit={async (value, key) => {
                await p.onSubmit(value, key);
                setShowInput(false);
              }}
            />
          </div>
          <div className="viewer-column" hidden={showInput}>
            <StructureViewer
              urls={p.urls}
              language={p.language}
              focusResidue={p.focusResidue}
              comparison={p.compared.length > 1}
            />
          </div>
          <div className="candidate-column" hidden={showInput}>
            <h2 className="result-task-name">
              {p.job?.request.name}{" "}
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
        </div>
        {!showInput && (
          <AnalysisGrid
            analysis={p.analysis}
            candidate={p.candidate}
            language={p.language}
            onResidue={p.onResidue}
            components={componentsOf(p.job?.request)}
          />
        )}
      </section>
      {!showInput &&
        p.job &&
        p.candidate &&
        (!("parameters" in p.job.request) ||
          p.job.request.parameters.atom_confidence !== false) && (
          <details className="confidence-details">
            <summary>
              {zh
                ? "查看 PAE / PDE / 接触概率 / 逐原子置信度"
                : "Inspect PAE / PDE / contact probability / atom confidence"}
            </summary>
            <ConfidencePanel
              jobId={p.job.id}
              candidate={p.candidate.id}
              language={p.language}
            />
          </details>
        )}
      {p.job && !showInput && (
        <details className="execution-detail">
          <summary>
            {zh ? "任务详情与运行日志" : "Task details and execution log"}{" "}
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
    </>
  );
}
