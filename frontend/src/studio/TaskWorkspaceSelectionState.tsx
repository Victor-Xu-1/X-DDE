import { LoadingOutlined, WarningOutlined } from "@ant-design/icons";
import { ApiError } from "../api";
import type { Language } from "../types";
import { EmptyState } from "./EmptyState";

/** A requested task remains a selection even before its metadata is available. */
export function TaskWorkspaceSelectionState({
  language,
  error,
  loading,
  onRetry,
  historyHref,
}: {
  language: Language;
  error: Error | null;
  loading: boolean;
  onRetry(): void;
  historyHref: string;
}) {
  const zh = language === "zh";
  const missing = error instanceof ApiError && error.status === 404;
  return (
    <EmptyState
      icon={error ? <WarningOutlined /> : <LoadingOutlined />}
      role={error ? "alert" : "status"}
      title={
        missing
          ? zh
            ? "任务不可用"
            : "Task unavailable"
          : error
            ? zh
              ? "无法读取任务"
              : "Unable to load task"
            : zh
              ? "正在读取所选任务…"
              : "Loading selected task…"
      }
      description={
        missing
          ? zh
            ? "此工作空间中找不到所选任务。返回任务历史以选择其他任务。"
            : "The selected task could not be found in this workspace. Return to task history to choose another task."
          : error
            ? zh
              ? "暂时无法读取所选任务。请检查连接后重试。"
              : "The selected task could not be read. Check your connection and retry."
            : zh
              ? "正在读取任务信息，你也可以返回任务历史。"
              : "Reading the task information. You can also return to task history."
      }
    >
      {error && !missing && (
        <button
          type="button"
          className="primary-button"
          onClick={onRetry}
          disabled={loading}
          aria-busy={loading}
        >
          {zh ? "重试" : "Retry"}
        </button>
      )}
      <a className="secondary-button" href={historyHref}>
        {zh ? "返回任务历史" : "Back to task history"}
      </a>
    </EmptyState>
  );
}
