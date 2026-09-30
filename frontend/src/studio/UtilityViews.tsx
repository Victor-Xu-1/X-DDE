import { componentsOf, isPrediction } from "../operations/types";
import {
  DownloadOutlined,
  FileTextOutlined,
  BarChartOutlined,
  ProfileOutlined,
  ReloadOutlined,
} from "@ant-design/icons";
import { TaskDetail } from "../TaskDetail";
import { ProjectPanel } from "./ProjectPanel";
import { CandidatePanel } from "./CandidatePanel";
import { AnalysisGrid } from "./AnalysisGrid";
import { EmptyState } from "./EmptyState";
import { RuntimeStatus } from "./RuntimeStatus";
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
  Prediction,
} from "../types";
interface Props {
  view: View;
  language: Language;
  health: Health | null;
  jobs: Job[];
  job: Job | null;
  detail: Detail | null;
  detailError: boolean;
  loading: boolean;
  connectionError: boolean;
  onRefresh(): void;
  onJob(id: string): void;
  onChanged(job: Job): void;
  onHome(): void;
  onStart(): void;
  onSetup(): void;
  onTasks(): void;
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
  onDraft?(request: Prediction): void;
}
export function UtilityViews(p: Props) {
  const zh = p.language === "zh",
    t = translator(p.language);
  const filteredJobs = p.jobs.filter(
    (job) => !p.projectId || job.request.project_id === p.projectId,
  );
  const taskJob =
    p.job && (!p.projectId || p.job.request.project_id === p.projectId)
      ? p.job
      : null;
  const taskJobs =
    taskJob && !filteredJobs.some((job) => job.id === taskJob.id)
      ? [taskJob, ...filteredJobs]
      : filteredJobs;
  const projectName = p.projects.find(
    (project) => project.id === p.projectId,
  )?.name;
  const taskLoadError = (
    <EmptyState
      role="alert"
      icon={<ReloadOutlined />}
      title={zh ? "暂时无法读取任务" : "Unable to load tasks"}
      description={
        zh
          ? "请确认工作台正在运行，然后重新连接。"
          : "Check that the workbench is running, then reconnect."
      }
    >
      <button className="primary-button" onClick={p.onRefresh}>
        {zh ? "重新连接" : "Reconnect"}
      </button>
    </EmptyState>
  );
  const taskLoading = (
    <p className="notice" role="status">
      {zh ? "正在读取任务…" : "Loading tasks…"}
    </p>
  );
  if (p.view === "projects")
    return (
      <ProjectPanel
        language={p.language}
        projects={p.projects}
        error={p.projectError}
        active={p.projectId}
        onChoose={(id) => {
          p.onProject(id);
          p.onTasks();
        }}
        onCreated={p.reloadProjects}
      />
    );
  if (p.view === "tasks")
    return (
      <section className="utility-page">
        <div className="section-heading utility-heading">
          <h1 className="sr-only">{zh ? "任务记录" : "Task history"}</h1>
          {p.projectId && (
            <div
              className="task-project-filter"
              role="group"
              aria-label={zh ? "项目筛选" : "Project filter"}
            >
              <span>
                {zh ? "项目：" : "Project: "}
                {projectName ?? (zh ? "当前项目" : "Selected project")}
              </span>
              <button
                className="secondary-button"
                onClick={() => p.onProject(null)}
              >
                {zh ? "清除筛选" : "Clear filter"}
              </button>
            </div>
          )}
        </div>
        <p>
          {zh
            ? "跟踪研究进度，查看结果与运行记录。"
            : "Track research progress, inspect results and review execution records."}
        </p>
        {p.connectionError && taskJobs.length > 0 && (
          <p className="error-box" role="alert">
            {zh
              ? "连接已中断，任务状态可能尚未更新。"
              : "Connection lost. Task status may be out of date."}{" "}
            <button onClick={p.onRefresh}>
              {zh ? "重新连接" : "Reconnect"}
            </button>
          </p>
        )}
        {!taskJobs.length ? (
          p.connectionError ? (
            taskLoadError
          ) : p.loading ? (
            taskLoading
          ) : (
            <EmptyState
              icon={<ProfileOutlined />}
              title={
                p.projectId
                  ? zh
                    ? "这个项目还没有任务"
                    : "No tasks in this project yet"
                  : zh
                    ? "还没有研究任务"
                    : "No research tasks yet"
              }
              description={
                p.projectId
                  ? zh
                    ? "可以开始新的研究，或清除项目筛选查看全部任务。"
                    : "Start new research, or clear the project filter to see all tasks."
                  : zh
                    ? "从研究能力中选择一项工具并创建任务，在这里跟踪进度、查看结果。"
                    : "Choose a research tool and create a task to track its progress and inspect results here."
              }
            >
              <button className="primary-button" onClick={p.onStart}>
                {zh ? "开始研究" : "Start research"}
              </button>
            </EmptyState>
          )
        ) : (
          <div className="task-page-grid">
            <div className="studio-panel task-page-list">
              <h3>{t("recent")}</h3>
              {taskJobs.map((x) => (
                <button
                  key={x.id}
                  className={x.id === taskJob?.id ? "selected" : undefined}
                  aria-pressed={x.id === taskJob?.id}
                  onClick={() => p.onJob(x.id)}
                >
                  <span>{x.request.name}</span>
                  <small className={"status " + x.status}>{t(x.status)}</small>
                </button>
              ))}
            </div>
            <TaskDetail
              key={taskJob?.id}
              language={p.language}
              job={taskJob}
              detail={p.detail}
              failed={p.detailError}
              onChange={p.onChanged}
              onDraft={p.onDraft}
            />
          </div>
        )}
      </section>
    );
  if ((p.view === "analysis" || p.view === "reports") && !p.job)
    return (
      <section className="utility-page">
        <h1>
          {p.view === "analysis"
            ? zh
              ? "结果解读"
              : "Result interpretation"
            : zh
              ? "导出结果"
              : "Export results"}
        </h1>
        {p.connectionError && !p.jobs.length ? (
          taskLoadError
        ) : p.loading ? (
          taskLoading
        ) : (
          <EmptyState
            icon={
              p.view === "analysis" ? (
                <BarChartOutlined />
              ) : (
                <FileTextOutlined />
              )
            }
            title={
              p.jobs.length
                ? zh
                  ? "先选择一项研究任务"
                  : "Choose a research task"
                : zh
                  ? "结果从第一项任务开始"
                  : "Results begin with your first task"
            }
            description={
              p.jobs.length
                ? zh
                  ? "前往任务记录选择任务，查看它的结果与可下载文件。"
                  : "Select a task in Task history to inspect its results and available downloads."
                : zh
                  ? "选择研究能力并创建任务，完成后即可在这里查看和导出结果。"
                  : "Choose a research tool and create a task. Return here to inspect and export its results."
            }
          >
            <button
              className="primary-button"
              onClick={p.jobs.length ? p.onTasks : p.onStart}
            >
              {p.jobs.length
                ? zh
                  ? "选择任务"
                  : "Choose task"
                : zh
                  ? "开始研究"
                  : "Start research"}
            </button>
            {p.jobs.length > 0 && (
              <button className="secondary-button" onClick={p.onStart}>
                {zh ? "开始新研究" : "Start new research"}
              </button>
            )}
          </EmptyState>
        )}
      </section>
    );
  if (p.view === "analysis" && p.job && !isPrediction(p.job.request))
    return (
      <section className="utility-page">
        <h1 className="sr-only">{zh ? "结果解读" : "Result interpretation"}</h1>
        <TaskDetail
          language={p.language}
          job={p.job}
          detail={p.detail}
          failed={p.detailError}
          onChange={p.onChanged}
          onDraft={p.onDraft}
        />
        <button className="secondary-button" onClick={p.onTasks}>
          {zh ? "返回任务记录" : "Back to Task history"}
        </button>
      </section>
    );
  if (p.view === "analysis")
    return (
      <section className="utility-page">
        <h1 className="sr-only">{zh ? "结果解读" : "Result interpretation"}</h1>
        <p>{p.job?.request.name}</p>
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
          components={componentsOf(p.job?.request)}
        />
        <div className="empty-state-actions">
          {p.job?.status === "succeeded" && (
            <button className="secondary-button" onClick={p.onHome}>
              {zh ? "查看三维结构" : "View 3D structure"}
            </button>
          )}
          <button className="secondary-button" onClick={p.onTasks}>
            {zh ? "选择其他任务" : "Choose another task"}
          </button>
        </div>
      </section>
    );
  if (p.view === "reports")
    return (
      <section className="utility-page">
        <h1 className="sr-only">{zh ? "导出结果" : "Export results"}</h1>
        <div className="studio-panel report-panel">
          {p.job?.status === "succeeded" && isPrediction(p.job.request) ? (
            <>
              <h3>{p.job.request.name}</h3>
              {p.loadingAnalysis ? (
                <p role="status">
                  {zh ? "正在读取导出结果…" : "Loading export results…"}
                </p>
              ) : p.analysisError ? (
                <div className="error-box" role="alert">
                  <strong>
                    {zh
                      ? "暂时无法加载结果报告"
                      : "Unable to load the result report"}
                  </strong>
                  <p>{p.analysisError}</p>
                  <button className="secondary-button" onClick={p.onRetry}>
                    {zh ? "重新加载结果" : "Reload results"}
                  </button>
                </div>
              ) : p.analysis ? (
                <>
                  <a
                    href={"/api/jobs/" + p.job.id + "/candidates.csv"}
                    download
                  >
                    <DownloadOutlined aria-hidden="true" />{" "}
                    {zh
                      ? "下载构象结果表（CSV）"
                      : "Download conformer table (CSV)"}
                  </a>
                  <a href={"/api/jobs/" + p.job.id + "/report"} download>
                    <FileTextOutlined aria-hidden="true" />{" "}
                    {zh
                      ? "下载结果报告（HTML）"
                      : "Download result report (HTML)"}
                  </a>
                </>
              ) : (
                <div className="notice" role="status">
                  <p>
                    {zh
                      ? "结果报告尚未准备好。"
                      : "The result report is not ready yet."}
                  </p>
                  <button className="secondary-button" onClick={p.onRetry}>
                    {zh ? "重新加载结果" : "Reload results"}
                  </button>
                </div>
              )}
              <a href={"/api/jobs/" + p.job.id + "/input"} download>
                <DownloadOutlined aria-hidden="true" /> {t("inputJson")}
              </a>
              <details className="execution-detail">
                <summary>
                  {zh
                    ? "原始文件与任务详情"
                    : "Original files and task details"}
                </summary>
                <TaskDetail
                  key={p.job.id}
                  language={p.language}
                  job={p.job}
                  detail={p.detail}
                  failed={p.detailError}
                  onChange={p.onChanged}
                  onDraft={p.onDraft}
                />
              </details>
            </>
          ) : p.job ? (
            <TaskDetail
              language={p.language}
              job={p.job}
              detail={p.detail}
              failed={p.detailError}
              onChange={p.onChanged}
              onDraft={p.onDraft}
            />
          ) : (
            <p>
              {zh
                ? "先从任务记录选择一项任务。"
                : "Select a task from Task history first."}
            </p>
          )}
          <button className="secondary-button" onClick={p.onTasks}>
            {zh ? "返回任务记录" : "Back to Task history"}
          </button>
        </div>
      </section>
    );
  if (p.view === "models")
    return (
      <RuntimeStatus
        language={p.language}
        health={p.health}
        connectionError={p.connectionError}
        onRefresh={p.onRefresh}
        onSetup={p.onSetup}
      />
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
                  "从六类任务中选择目标；有靶蛋白和小分子选“蛋白–小分子”，抗体–抗原任务自动使用已安装的 ABAG 模型。",
                ],
                [
                  "填输入",
                  "复制 SMILES 或序列，每条链分别填写。DNA 使用 T，RNA 使用 U。专家模式可添加离子与其他组分；首次可填入咖啡因示例。",
                ],
                [
                  "选方案",
                  "首次研究用“标准预测”；想比较多个构象用“多构象比较”；只检查流程用“快速试跑”。",
                ],
                [
                  "看结果",
                  "在“结构与结果”中看构象与口袋。点击原子/残基，选择范围、显示样式或两点测距；问号提供解释。显示编辑不改变分子坐标。",
                ],
              ]
            : [
                [
                  "Choose a task",
                  "Choose among six workflows. Antibody–antigen defaults to the installed ABAG checkpoint; use Protein–ligand when you have a target and compound.",
                ],
                [
                  "Enter molecules",
                  "Copy SMILES or sequences, one chain per field. DNA uses T and RNA uses U. Expert mode adds ions and custom assemblies; try caffeine to check the workflow.",
                ],
                [
                  "Choose a preset",
                  "Use Standard for your first research task, Compare conformers for alternatives, or Quick check to test the workflow.",
                ],
                [
                  "Inspect results",
                  "In Structure and results, inspect conformers and pockets. Select atoms/residues, choose a radius, edit display or measure two atoms. Display edits preserve molecular coordinates.",
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
              ? "“全部能力”包含性质计算、抗体设计、序列评分、MSA/模板和原生分析。需要的模型、数据库及服务在服务器配置。QED/SA 和结构置信度不能替代活性实验。"
              : "All capabilities includes molecular properties, antibody design, sequence scoring, MSA/templates and native analysis. Configure models, databases and services on the server. Descriptors and confidence do not replace activity experiments."}
          </p>
        </div>
        <button className="primary-button" onClick={p.onStart}>
          {zh ? "开始使用" : "Start"}
        </button>
      </section>
    );
  return null;
}
