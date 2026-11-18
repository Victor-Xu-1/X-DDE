import type { Language } from "../types";
import {
  canToggle,
  type RuntimeEngine,
  type useBackendRuntime,
} from "./backend-runtime";

type Runtime = ReturnType<typeof useBackendRuntime>;

function engineStatus(item: RuntimeEngine, zh: boolean) {
  if (item.activity_unknown) return zh ? "状态待确认" : "State unavailable";
  if (item.active) return zh ? "任务运行中" : "Task active";
  if (!item.ready)
    return item.enabled
      ? zh
        ? "当前不可用"
        : "Unavailable"
      : zh
        ? "已关闭 · 未就绪"
        : "Off · Not ready";
  if (item.enabled) return zh ? "已开启 · 按需加载" : "On · Loads on demand";
  return zh ? "已关闭" : "Off";
}

export function RuntimeSwitch({
  item,
  language,
  runtime,
}: {
  item: RuntimeEngine;
  language: Language;
  runtime: Runtime;
}) {
  const zh = language === "zh";
  const switching = runtime.busy === item.id;
  return (
    <div className="compute-switch runtime-switch" data-engine={item.id}>
      <span className="runtime-switch-label">
        <span title={item.name}>{item.name}</span>
        <small>
          {runtime.readError
            ? zh
              ? "状态待确认"
              : "State unavailable"
            : switching
              ? zh
                ? "正在切换…"
                : "Switching…"
              : engineStatus(item, zh)}
        </small>
      </span>
      <button
        type="button"
        role="switch"
        aria-label={item.name}
        aria-checked={item.enabled}
        disabled={
          Boolean(runtime.busy) || runtime.readError || !canToggle(item)
        }
        title={
          item.active
            ? zh
              ? "请先结束该后端的活动任务。"
              : "Finish this backend’s active task first."
            : zh
              ? "开启后在提交任务时加载。"
              : "Loads when you submit a task."
        }
        onClick={() => void runtime.toggle(item.id)}
      >
        <i aria-hidden="true" />
      </button>
    </div>
  );
}

export function BackendStateMessage({
  runtime,
  language,
  failed,
}: {
  runtime: Runtime;
  language: Language;
  failed: boolean;
}) {
  if (!runtime.readError && !failed) return null;
  const zh = language === "zh";
  return (
    <p className="backend-state-message" role="alert">
      {runtime.readError
        ? zh
          ? "无法读取后端状态。"
          : "Cannot read backend state."
        : zh
          ? "切换未完成，请检查后端及活动任务。"
          : "Switch failed. Check the backend and active tasks."}
      <button type="button" className="text-button" onClick={runtime.retry}>
        {zh ? "重试" : "Retry"}
      </button>
    </p>
  );
}
