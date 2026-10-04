import { useEffect, useState, type ReactNode } from "react";
import { ProfileOutlined, ReloadOutlined } from "@ant-design/icons";
import { TaskDetail } from "../TaskDetail";
import { isPrediction } from "../operations/types";
import { EmptyState } from "./EmptyState";
import { translator } from "../i18n";
import type { Detail, Job, Language, Project, Prediction } from "../types";
interface Props {
  language: Language;
  jobs: Job[];
  job: Job | null;
  detail: Detail | null;
  detailError: boolean;
  loading: boolean;
  connectionError: boolean;
  projects: Project[];
  projectId: string | null;
  onRefresh(): void;
  onJob(id: string): void;
  onChanged(job: Job): void;
  onStart(): void;
  onProject(id: string | null): void;
  onDraft?(request: Prediction): void;
  prediction: ReactNode;
}
export function TaskWorkspace(p: Props) {
  const zh = p.language === "zh",
    t = translator(p.language);
  const filteredJobs = p.jobs.filter(
    (job) => !p.projectId || job.request.project_id === p.projectId,
  );
  const taskJob =
    p.job && (!p.projectId || p.job.request.project_id === p.projectId)
      ? p.job
      : null;
  const [choosing, setChoosing] = useState(true);
  useEffect(() => {
    setChoosing(!taskJob);
  }, [taskJob?.id]);
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
  return (
    <section className="utility-page">
      <div className="section-heading utility-heading">
        <h1 className="sr-only">{zh ? "任务与结果" : "Tasks and results"}</h1>
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
      {p.connectionError && taskJobs.length > 0 && (
        <p className="error-box" role="alert">
          {zh
            ? "连接已中断，任务状态可能尚未更新。"
            : "Connection lost. Task status may be out of date."}{" "}
          <button onClick={p.onRefresh}>{zh ? "重新连接" : "Reconnect"}</button>
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
        <div className="task-page-content">
          <details
            className="task-picker"
            open={choosing}
            onToggle={(event) => setChoosing(event.currentTarget.open)}
          >
            <summary>{zh ? "任务列表" : "Task list"}</summary>
            <div className="studio-panel task-page-list">
              <h3>{t("recent")}</h3>
              {taskJobs.map((x) => (
                <button
                  key={x.id}
                  className={x.id === taskJob?.id ? "selected" : undefined}
                  aria-pressed={x.id === taskJob?.id}
                  onClick={() => {
                    p.onJob(x.id);
                    setChoosing(false);
                  }}
                >
                  <span>{x.request.name}</span>
                  <small className={"status " + x.status}>{t(x.status)}</small>
                </button>
              ))}
            </div>
          </details>
          <div className="task-result-content">
            {taskJob &&
            taskJob.status === "succeeded" &&
            isPrediction(taskJob.request) ? (
              p.prediction
            ) : (
              <TaskDetail
                key={taskJob?.id}
                language={p.language}
                job={taskJob}
                detail={p.detail}
                failed={p.detailError}
                onChange={p.onChanged}
                onDraft={p.onDraft}
              />
            )}
          </div>
        </div>
      )}
    </section>
  );
}
