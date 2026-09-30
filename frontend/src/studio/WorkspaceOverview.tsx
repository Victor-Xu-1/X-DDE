import { isPrediction } from "../operations/types";
import type { Health, Job, Language } from "../types";

export function WorkspaceOverview({
  language,
  jobs,
  health,
}: {
  language: Language;
  jobs: Job[];
  health: Health | null;
}) {
  const zh = language === "zh";
  const today = jobs.filter(
    (job) =>
      new Date(job.created_at).toDateString() === new Date().toDateString(),
  );
  const running = jobs.filter((job) => job.status === "running").length;
  const free = health?.free_disk_gib;
  const total = health?.disk_total_gib;
  const used =
    free != null && total
      ? Math.min(100, Math.max(0, Math.round((1 - free / total) * 100)))
      : null;
  return (
    <section className="utility-page workspace-overview">
      <div className="management-heading">
        <span>{zh ? "工作台管理" : "Workbench management"}</span>
        <h1>{zh ? "工作空间概况" : "Workspace overview"}</h1>
        <p>
          {zh
            ? "任务与存储状态集中在这里，研究区域保持简洁。"
            : "Task and storage status in one place, leaving room for research."}
        </p>
      </div>
      <div className="management-card">
        <h2>{zh ? "研究项目" : "Research projects"}</h2>
        <p>
          {running
            ? zh
              ? "任务运行中"
              : "Tasks running"
            : zh
              ? "等待新任务"
              : "Ready for a new task"}
        </p>
        <dl className="overview-stats">
          <div>
            <dt>{zh ? "今日结构预测" : "Today's predictions"}</dt>
            <dd>{today.filter((job) => isPrediction(job.request)).length}</dd>
          </div>
          <div>
            <dt>{zh ? "运行中" : "Running"}</dt>
            <dd>{running}</dd>
          </div>
        </dl>
      </div>
      <div className="management-card">
        <h2>{zh ? "存储空间" : "Storage"}</h2>
        <p>
          {free == null
            ? zh
              ? "暂无法读取"
              : "Not available"
            : free.toFixed(1) + " GiB " + (zh ? "可用" : "free")}
        </p>
        {used !== null && (
          <>
            <div
              className="storage-meter"
              role="progressbar"
              aria-label={zh ? "磁盘使用比例" : "Disk usage"}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={used}
            >
              <span style={{ width: used + "%" }} />
            </div>
            <small>
              {used}% {zh ? "已使用" : "used"}
            </small>
          </>
        )}
        {health?.engine.gpu && <p>GPU · {health.engine.gpu.split(",")[0]}</p>}
      </div>
    </section>
  );
}
