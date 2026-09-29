import { useRef } from "react";
import {
  CheckCircleOutlined,
  CloseCircleOutlined,
  ReloadOutlined,
} from "@ant-design/icons";
import { TaskForm } from "../TaskForm";
import { TaskDetail } from "../TaskDetail";
import { Capabilities } from "./Capabilities";
import { ReferenceProjects } from "./ReferenceProjects";
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
  reference: string | null;
  onReference(id: string): void;
  onView(value: "projects" | "analysis" | "reports"): void;
  compared: string[];
  onCompare(ids: string[]): void;
  focusResidue: { residue: string; nonce: number } | null;
  onResidue(residue: string): void;
  draft: Prediction | null;
  onReuse(): void;
  onSubmit(value: Prediction, key: string): Promise<void>;
}
export function HomeWorkspace(p: Props) {
  const zh = p.language === "zh",
    t = translator(p.language),
    input = useRef<HTMLDivElement>(null),
    viewer = useRef<HTMLDivElement>(null);
  return (
    <>
      <header className="studio-intro">
        <div>
          <h1>
            {zh ? "OpenDDE 药物结构工作台" : "OpenDDE Structure Workbench"}
          </h1>
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
        <div className="error-box" role="alert">
          {p.health.worker_error || p.health.engine.reason}
        </div>
      )}
      <Capabilities
        language={p.language}
        onChoose={(value) =>
          value === "input"
            ? input.current?.scrollIntoView({
                behavior: "smooth",
                block: "start",
              })
            : value === "viewer"
              ? viewer.current?.scrollIntoView({
                  behavior: "smooth",
                  block: "center",
                })
              : p.onView(value)
        }
      />
      <ReferenceProjects
        language={p.language}
        onChoose={p.onReference}
        onNew={() => p.onView("projects")}
      />
      <section className="workbench-section">
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
              value={p.reference ? "" : (p.job?.id ?? "")}
              onChange={(e) => {
                if (e.target.value) p.onJob(e.target.value);
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
          {p.job && (
            <button className="quickstart" onClick={p.onReuse}>
              <ReloadOutlined /> {zh ? "复用此任务输入" : "Reuse inputs"}
            </button>
          )}
        </div>
        <div className="workbench-columns">
          <div className="input-column" ref={input}>
            <TaskForm
              language={p.language}
              ready={p.ready}
              abagAvailable={Boolean(p.health?.engine.models?.abag)}
              initialRequest={p.draft}
              onSubmit={p.onSubmit}
            />
          </div>
          <div className="viewer-column" ref={viewer}>
            <StructureViewer
              urls={p.urls}
              language={p.language}
              reference={p.reference}
              focusResidue={p.focusResidue}
              comparison={p.compared.length > 1}
            />
          </div>
          <div className="candidate-column">
            <CandidatePanel
              key={p.reference || p.job?.id || "empty"}
              job={p.reference ? null : p.job}
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
        <AnalysisGrid
          analysis={p.analysis}
          candidate={p.candidate}
          language={p.language}
          onResidue={p.onResidue}
        />
      </section>
      {p.job && !p.reference && (
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
