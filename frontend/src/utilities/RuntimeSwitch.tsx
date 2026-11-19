import type { Language } from "../types";
import { BackendPowerSwitch } from "./BackendPowerSwitch";
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
        ? "已关闭 · 待配置"
        : "Off · Setup required";
  if (item.enabled) return zh ? "已开启 · 按需加载" : "On · Loads on demand";
  return zh ? "已关闭" : "Off";
}

export function RuntimeSwitch({
  item,
  language,
  runtime,
  showName = true,
  taskNames,
  current = false,
}: {
  item: RuntimeEngine;
  language: Language;
  runtime: Runtime;
  showName?: boolean;
  taskNames?: readonly string[];
  current?: boolean;
}) {
  const zh = language === "zh";
  const switching = runtime.busy === item.id;
  const needsSetup =
    !runtime.readError &&
    !item.ready &&
    !item.enabled &&
    !item.active &&
    !item.activity_unknown;
  return (
    <BackendPowerSwitch
      id={item.id}
      name={item.name}
      showName={showName}
      context={
        taskNames?.length ? (
          <span className="runtime-switch-tasks" title={taskNames.join(" · ")}>
            {taskNames.join(" · ")}
          </span>
        ) : undefined
      }
      current={current}
      status={
        runtime.readError
          ? zh
            ? "状态待确认"
            : "State unavailable"
          : switching
            ? zh
              ? "正在切换…"
              : "Switching…"
            : engineStatus(item, zh)
      }
      enabled={item.enabled}
      disabled={runtime.readError || !canToggle(item)}
      pending={Boolean(runtime.busy)}
      setup={
        showName &&
        needsSetup && (
          <a
            className="runtime-switch-setup"
            href="#view=deployment"
            target="_blank"
            rel="noopener"
            aria-label={
              zh
                ? `配置 ${item.name}（在新标签页打开）`
                : `Set up ${item.name} (opens in a new tab)`
            }
          >
            {zh ? "配置" : "Set up"}
          </a>
        )
      }
      hint={
        item.active
          ? zh
            ? "请先结束该后端的活动任务。"
            : "Finish this backend’s active task first."
          : item.ready
            ? zh
              ? "开启后在执行任务时加载。"
              : "Loads when a task runs."
            : undefined
      }
      onToggle={() => void runtime.toggle(item.id)}
    />
  );
}

export function BackendStateMessage({
  runtime,
  language,
  failed,
  focusAfterRetry,
}: {
  runtime: Runtime;
  language: Language;
  failed: boolean;
  focusAfterRetry?(): void;
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
      <button
        type="button"
        className="text-button"
        onClick={() => {
          runtime.retry();
          focusAfterRetry?.();
        }}
      >
        {zh ? "重试" : "Retry"}
      </button>
    </p>
  );
}
