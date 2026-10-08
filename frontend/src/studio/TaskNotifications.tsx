import { useEffect, useRef } from "react";
import { BellOutlined } from "@ant-design/icons";
import { translator } from "../i18n";
import type { Job, Language } from "../types";

export function TaskNotifications({
  jobs,
  language,
  onJob,
}: {
  jobs: Job[];
  language: Language;
  onJob(id: string): void;
}) {
  const zh = language === "zh",
    t = translator(language),
    notifications = useRef<HTMLDetailsElement>(null);
  const problems = jobs
    .filter((job) => ["failed", "interrupted"].includes(job.status))
    .slice(0, 5);
  useEffect(() => {
    function outside(event: PointerEvent) {
      if (
        !notifications.current?.contains(event.target as Node) &&
        notifications.current
      )
        notifications.current.open = false;
    }
    document.addEventListener("pointerdown", outside);
    return () => document.removeEventListener("pointerdown", outside);
  }, []);
  return (
    <details
      className="top-popover"
      ref={notifications}
      onKeyDown={(event) => {
        if (event.key === "Escape" && notifications.current?.open) {
          event.preventDefault();
          notifications.current.open = false;
          notifications.current.querySelector("summary")?.focus();
        }
      }}
    >
      <summary aria-label={zh ? "任务提醒" : "Task notifications"}>
        <BellOutlined />
        {problems.length > 0 && <span className="notification-dot" />}
      </summary>
      <div>
        <strong>{zh ? "需关注的任务" : "Tasks needing attention"}</strong>
        {problems.length ? (
          problems.map((job) => (
            <button
              type="button"
              key={job.id}
              onClick={() => {
                if (notifications.current) notifications.current.open = false;
                onJob(job.id);
              }}
            >
              {job.request.name} · {t(job.status)}
            </button>
          ))
        ) : (
          <p>{zh ? "目前没有失败任务" : "No failed tasks"}</p>
        )}
      </div>
    </details>
  );
}
