import { useState } from "react";
import { api } from "../api";
import type { Language } from "../types";
import type { Deployment } from "../deployment/client";

export function ComputeSwitch({
  data,
  language,
  refresh,
}: {
  data: Deployment | null;
  language: Language;
  refresh(): void;
}) {
  const zh = language === "zh",
    service = data?.compute_service;
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const installed = Boolean(service?.configured);
  const running = Boolean(service?.running);
  const label = !installed
    ? zh
      ? "计算后端未安装"
      : "Compute not installed"
    : running
      ? zh
        ? "计算后端已开启"
        : "Compute enabled"
      : zh
        ? "计算后端已关闭"
        : "Compute off";
  return (
    <div className="compute-switch">
      <button
        type="button"
        role="switch"
        aria-checked={running}
        aria-label={label}
        disabled={busy || !installed || service?.cleanup_pending}
        title={
          zh
            ? "按需启用；有活动任务时不能关闭"
            : "Start on demand; active tasks prevent shutdown"
        }
        onClick={async () => {
          setBusy(true);
          setError("");
          try {
            await api.post(
              `/deployment/compute/${running ? "stop" : "start"}`,
              {},
              undefined,
              120000,
            );
          } catch {
            setError(
              zh
                ? "操作未完成，请在安装与运行中检查状态。"
                : "Action did not complete. Check Installation and runtime.",
            );
          } finally {
            setBusy(false);
            refresh();
          }
        }}
      >
        <span>{busy ? (zh ? "正在切换…" : "Changing…") : label}</span>
        <i aria-hidden="true" />
      </button>
      {error && <span role="alert">{error}</span>}
    </div>
  );
}
