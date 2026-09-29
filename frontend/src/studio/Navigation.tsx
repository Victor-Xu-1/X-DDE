import {
  HomeFilled,
  FolderOutlined,
  ProfileOutlined,
  DeploymentUnitOutlined,
  ExperimentOutlined,
  BarChartOutlined,
  FileTextOutlined,
  DatabaseOutlined,
  QuestionCircleOutlined,
  SearchOutlined,
  BellOutlined,
  UserOutlined,
} from "@ant-design/icons";
import { useState } from "react";
import type { Job, Language } from "../types";

export type View =
  | "home"
  | "tools"
  | "projects"
  | "tasks"
  | "analysis"
  | "reports"
  | "models"
  | "help";
const items = [
  {
    id: "tools",
    cn: "全部能力",
    en: "All capabilities",
    icon: ExperimentOutlined,
  },
  { id: "home", cn: "预测工作台", en: "Workbench", icon: HomeFilled },
  { id: "projects", cn: "项目空间", en: "Projects", icon: FolderOutlined },
  { id: "tasks", cn: "任务中心", en: "Task center", icon: ProfileOutlined },
  { id: "analysis", cn: "结果解读", en: "Results", icon: BarChartOutlined },
  { id: "reports", cn: "导出结果", en: "Exports", icon: FileTextOutlined },
  {
    id: "models",
    cn: "运行状态",
    en: "Runtime status",
    icon: DatabaseOutlined,
  },
  { id: "help", cn: "帮助中心", en: "Help", icon: QuestionCircleOutlined },
] as const;
export function Navigation({
  view,
  onView,
  language,
  jobs,
  gpu,
  free,
  total,
}: {
  view: View;
  onView(value: View): void;
  language: Language;
  jobs: Job[];
  gpu: string | undefined;
  free: number | undefined;
  total: number | undefined;
}) {
  const zh = language === "zh";
  const running = jobs.filter((item) => item.status === "running").length;
  const today = jobs.filter(
    (item) =>
      new Date(item.created_at).toDateString() === new Date().toDateString(),
  );
  return (
    <aside className="studio-sidebar">
      <button className="studio-brand" onClick={() => onView("tools")}>
        <DeploymentUnitOutlined className="studio-brand-mark" />
        <span>
          <strong>OpenDDE</strong>
          <small>{zh ? "药 物 研 究 工 作 台" : "DISCOVERY WORKBENCH"}</small>
        </span>
      </button>
      <nav aria-label={zh ? "主导航" : "Main navigation"}>
        {items.map((item) => (
          <button
            key={item.id}
            title={zh ? item.cn : item.en}
            className={view === item.id ? "active" : ""}
            onClick={() => onView(item.id)}
          >
            <item.icon />
            <span>{zh ? item.cn : item.en}</span>
            {item.id === "tasks" && running > 0 && <b>{running}</b>}
          </button>
        ))}
      </nav>
      <div className="sidebar-status">
        <div className="sidebar-project">
          <span>{zh ? "当前工作空间" : "Current workspace"}</span>
          <strong>{zh ? "研究项目" : "Research projects"}</strong>
          <small>
            {running
              ? zh
                ? "任务运行中"
                : "Task running"
              : zh
                ? "等待新任务"
                : "Ready for a new task"}
          </small>
        </div>
        <div className="sidebar-divider" />
        <span>{zh ? "今日任务" : "Today"}</span>
        <p>
          <DeploymentUnitOutlined /> {zh ? "结构预测" : "Predictions"}{" "}
          <strong>{today.length}</strong>
        </p>
        <p>
          <ExperimentOutlined /> {zh ? "运行中" : "Running"}{" "}
          <strong>{running}</strong>
        </p>
        <div className="sidebar-divider" />
        <span>{zh ? "存储空间" : "Storage"}</span>
        <div
          className="storage-meter"
          role="progressbar"
          aria-label={zh ? "磁盘已用比例" : "Disk usage"}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={
            free != null && total ? Math.round((1 - free / total) * 100) : 0
          }
        >
          <span
            style={{
              width:
                free != null && total
                  ? `${Math.min(100, Math.max(0, (1 - free / total) * 100))}%`
                  : "0%",
            }}
          />
        </div>
        <small>
          {free == null ? "—" : `${free.toFixed(1)} GiB`} {zh ? "可用" : "free"}
        </small>
        {gpu && <small>GPU · {gpu.split(",")[0]}</small>}
      </div>
    </aside>
  );
}
export function Header({
  language,
  onLanguage,
  jobs,
  onJob,
  onView,
  storageWarning,
}: {
  language: Language;
  onLanguage(value: Language): void;
  jobs: Job[];
  onJob(id: string): void;
  onView(value: View): void;
  storageWarning: boolean;
}) {
  const zh = language === "zh";
  const [query, setQuery] = useState("");
  const matches = query.trim()
    ? jobs
        .filter((job) =>
          `${job.request.name} ${job.id}`
            .toLocaleLowerCase()
            .includes(query.toLocaleLowerCase()),
        )
        .slice(0, 8)
    : [];
  const problems = jobs
    .filter((job) => ["failed", "interrupted"].includes(job.status))
    .slice(0, 5);
  return (
    <header className="studio-topbar">
      <div className="global-search">
        <SearchOutlined />
        <label className="sr-only" htmlFor="global-search">
          {zh ? "搜索任务" : "Search tasks"}
        </label>
        <input
          id="global-search"
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={zh ? "搜索任务名称或 ID" : "Search tasks by name or ID"}
        />
        {query && (
          <div className="search-results" role="listbox">
            {matches.length ? (
              matches.map((job) => (
                <button
                  role="option"
                  aria-selected="false"
                  key={job.id}
                  onClick={() => {
                    onJob(job.id);
                    setQuery("");
                  }}
                >
                  {job.request.name}
                  <small>{job.id.slice(0, 8)}</small>
                </button>
              ))
            ) : (
              <p>{zh ? "没有匹配的任务" : "No matching task"}</p>
            )}
          </div>
        )}
      </div>
      <div className="top-actions">
        <details className="top-popover">
          <summary aria-label={zh ? "任务提醒" : "Task notifications"}>
            <BellOutlined />
            {problems.length > 0 && <span className="notification-dot" />}
          </summary>
          <div>
            <strong>{zh ? "需关注的任务" : "Tasks needing attention"}</strong>
            {problems.length ? (
              problems.map((job) => (
                <button key={job.id} onClick={() => onJob(job.id)}>
                  {job.request.name} · {job.status}
                </button>
              ))
            ) : (
              <p>{zh ? "目前没有失败任务" : "No failed tasks"}</p>
            )}
          </div>
        </details>
        <button
          title={zh ? "帮助" : "Help"}
          aria-label={zh ? "帮助" : "Help"}
          onClick={() => onView("help")}
        >
          <QuestionCircleOutlined />
        </button>
        <label className="language-control">
          <span className="sr-only">{zh ? "界面语言" : "Language"}</span>
          <select
            value={language}
            onChange={(e) => onLanguage(e.target.value as Language)}
          >
            <option value="zh">中文</option>
            <option value="en">English</option>
          </select>
        </label>
        <details className="top-popover account-menu">
          <summary>
            <UserOutlined />
            <span>
              <strong>{zh ? "本地用户" : "Local user"}</strong>
              <small>{zh ? "单用户工作台" : "Single-user workbench"}</small>
            </span>
          </summary>
          <div>
            <strong>{zh ? "本机工作台" : "Local workbench"}</strong>
            <p>
              {zh
                ? "任务保存在配置的研究服务器；联网搜索和模型服务按任务选项使用。未启用团队登录。"
                : "Tasks use the configured research server; online searches and model services follow task settings. Team sign-in is not enabled."}
            </p>
          </div>
        </details>
      </div>
      {storageWarning && (
        <div role="status" className="header-warning">
          {zh
            ? "浏览器无法记住语言选择。"
            : "Language preference could not be saved."}
        </div>
      )}
    </header>
  );
}
