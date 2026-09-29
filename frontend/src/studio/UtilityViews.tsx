import {
  DownloadOutlined,
  FileTextOutlined,
  DeploymentUnitOutlined,
  DatabaseOutlined,
} from "@ant-design/icons";
import { TaskDetail } from "../TaskDetail";
import { ProjectPanel } from "./ProjectPanel";
import { CandidatePanel } from "./CandidatePanel";
import { AnalysisGrid } from "./AnalysisGrid";
import { translator } from "../i18n";
import type { View } from "./Navigation";
import type {
  Analysis,
  Candidate,
  Detail,
  Health,
  Job,
  Language,
  Project,
} from "../types";
interface Props {
  view: View;
  language: Language;
  ready: boolean;
  health: Health | null;
  jobs: Job[];
  job: Job | null;
  detail: Detail | null;
  detailError: boolean;
  loading: boolean;
  onJob(id: string): void;
  onChanged(job: Job): void;
  onHome(): void;
  projects: Project[];
  projectError: string;
  projectId: string | null;
  onProject(id: string | null): void;
  reloadProjects(): void;
  analysis: Analysis | null;
  candidate?: Candidate;
  loadingAnalysis: boolean;
  analysisError: string;
  onRetry(): void;
  onCandidate(id: string): void;
}
export function UtilityViews(p: Props) {
  const zh = p.language === "zh",
    t = translator(p.language);
  if (p.view === "projects")
    return (
      <ProjectPanel
        language={p.language}
        projects={p.projects}
        error={p.projectError}
        active={p.projectId}
        onChoose={p.onProject}
        onCreated={p.reloadProjects}
      />
    );
  if (p.view === "tasks")
    return (
      <section className="utility-page">
        <h1>{zh ? "任务中心" : "Task center"}</h1>
        <p>
          {zh
            ? "选择任务查看结果；运行中可取消，结束后可重新运行。"
            : "Select a task to inspect it. Cancel active tasks or rerun completed ones."}
        </p>
        <div className="task-page-grid">
          <div className="studio-panel task-page-list">
            <h3>{t("recent")}</h3>
            {p.loading ? (
              <p>{t("loading")}</p>
            ) : p.jobs.length ? (
              p.jobs.map((x) => (
                <button key={x.id} onClick={() => p.onJob(x.id)}>
                  <span>{x.request.name}</span>
                  <small className={"status " + x.status}>{t(x.status)}</small>
                </button>
              ))
            ) : (
              <p>{t("empty")}</p>
            )}
          </div>
          <TaskDetail
            key={p.job?.id}
            language={p.language}
            job={p.job}
            detail={p.detail}
            failed={p.detailError}
            onChange={p.onChanged}
          />
        </div>
      </section>
    );
  if (p.view === "analysis")
    return (
      <section className="utility-page">
        <h1>{zh ? "结果解读" : "Result interpretation"}</h1>
        <p>
          {p.job?.request.name ??
            (zh
              ? "先选择一个已完成的任务。"
              : "Choose a completed task first.")}
        </p>
        <CandidatePanel
          job={p.job}
          analysis={p.analysis}
          loading={p.loadingAnalysis}
          error={p.analysisError}
          onRetry={p.onRetry}
          language={p.language}
          selected={p.candidate?.id ?? null}
          onSelect={(id) => {
            p.onCandidate(id);
            p.onHome();
          }}
        />
        <AnalysisGrid
          analysis={p.analysis}
          candidate={p.candidate}
          language={p.language}
        />
        <button className="secondary-button" onClick={p.onHome}>
          {zh ? "回到三维预览" : "Return to 3D preview"}
        </button>
      </section>
    );
  if (p.view === "reports")
    return (
      <section className="utility-page">
        <h1>{zh ? "导出结果" : "Export results"}</h1>
        <p>
          {zh
            ? "结构文件用于进一步分析；表格用于整理数据；报告包含本次输入和指标解释。"
            : "Use structures for further analysis, tables for data review, and reports for inputs and metric definitions."}
        </p>
        <div className="studio-panel report-panel">
          {p.job?.status === "succeeded" && p.analysis ? (
            <>
              <h3>{p.job.request.name}</h3>
              <a href={"/api/jobs/" + p.job.id + "/candidates.csv"} download>
                <DownloadOutlined />{" "}
                {zh
                  ? "下载构象结果表（CSV）"
                  : "Download conformer table (CSV)"}
              </a>
              <a href={"/api/jobs/" + p.job.id + "/report"} download>
                <FileTextOutlined />{" "}
                {zh ? "下载结果报告（HTML）" : "Download result report (HTML)"}
              </a>
              <a href={"/api/jobs/" + p.job.id + "/input"} download>
                <DownloadOutlined /> {t("inputJson")}
              </a>
            </>
          ) : (
            <p>
              {zh
                ? "先完成或选择一个预测任务，再来下载结果。"
                : "Complete or select a prediction before exporting."}
            </p>
          )}
          <button className="secondary-button" onClick={p.onHome}>
            {zh ? "返回工作台" : "Back to workbench"}
          </button>
        </div>
      </section>
    );
  if (p.view === "models")
    return (
      <section className="utility-page">
        <h1>{zh ? "运行状态" : "Runtime status"}</h1>
        <p>
          {zh
            ? "这里显示本机是否可以开始计算。"
            : "Check whether this computer is ready to run a prediction."}
        </p>
        <div className="model-grid">
          <div className="studio-panel">
            <DeploymentUnitOutlined />
            <h3>{zh ? "预测引擎" : "Prediction engine"}</h3>
            <p>
              {p.health?.engine.gpu?.split(",")[0] ??
                (zh ? "正在读取 GPU" : "Checking GPU")}
            </p>
            <span className={"status " + (p.ready ? "succeeded" : "failed")}>
              {p.ready ? t("ready") : t("unavailable")}
            </span>
            {p.health?.engine.reason && (
              <p role="alert">{p.health.engine.reason}</p>
            )}
          </div>
          <div className="studio-panel">
            <DatabaseOutlined />
            <h3>{zh ? "结果存储空间" : "Result storage"}</h3>
            <p>
              {p.health?.free_disk_gib ?? "—"} GiB {zh ? "可用" : "free"}
            </p>
            <p>
              {zh
                ? "所有任务输入与结果保存在本机。"
                : "Task inputs and results stay on this computer."}
            </p>
          </div>
        </div>
      </section>
    );
  if (p.view === "help")
    return (
      <section className="utility-page">
        <h1>{zh ? "第一次使用" : "Getting started"}</h1>
        <div className="guide-grid">
          {(zh
            ? [
                [
                  "选任务",
                  "仅有小分子选“小分子结构”；有靶蛋白和小分子选“蛋白–小分子”。",
                ],
                [
                  "填输入",
                  "从结构编辑器复制 SMILES，从序列文件复制蛋白序列。可以先点咖啡因示例体验。",
                ],
                [
                  "选方案",
                  "首次研究用“标准预测”；想比较多个构象用“多构象比较”；只检查流程用“快速试跑”。",
                ],
                [
                  "看结果",
                  "点击构象切换三维结构，勾选 2–3 个叠加比较。点击附近残基可定位，问号提供解释。",
                ],
              ]
            : [
                [
                  "Choose a task",
                  "Use Small-molecule structure for a ligand alone, or Protein–ligand complex when you also have a target.",
                ],
                [
                  "Enter molecules",
                  "Copy SMILES from a structure editor and protein sequences from sequence files. Try caffeine first if needed.",
                ],
                [
                  "Choose a preset",
                  "Use Standard for your first research task, Compare conformers for alternatives, or Quick check to test the workflow.",
                ],
                [
                  "Inspect results",
                  "Select a conformer, check 2–3 to overlay, or click nearby residues to locate them. Question marks explain each metric.",
                ],
              ]
          ).map(([title, note], i) => (
            <div className="studio-panel" key={title}>
              <h3>
                {i + 1} · {title}
              </h3>
              <p>{note}</p>
            </div>
          ))}
        </div>
        <div className="notice">
          <p>
            {zh
              ? "目前执行无 MSA／模板的本地结构预测；工作台没有结合亲和力或小分子从头生成工具。结构和置信度不能替代活性实验。"
              : "Predictions currently run locally without MSA/templates. Binding-affinity and de novo small-molecule tools are not included. Structures and confidence do not replace activity experiments."}
          </p>
        </div>
        <button className="primary-button" onClick={p.onHome}>
          {zh ? "开始使用" : "Start"}
        </button>
      </section>
    );
  return null;
}
