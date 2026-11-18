import { useState } from "react";
import type { Language } from "../types";
import { computeActivity, ComputeSwitch } from "./ComputeSwitch";
import { useBackendRuntime } from "./backend-runtime";
import { BackendStateMessage, RuntimeSwitch } from "./RuntimeSwitch";
import "./runtime-switch.css";

export function BackendControls({ language }: { language: Language }) {
  const zh = language === "zh";
  const [open, setOpen] = useState(false);
  const runtime = useBackendRuntime(open, undefined, true);
  const harness = runtime.catalogue?.engines.find(
    (row) => row.id === "harness",
  );
  return (
    <div className="backend-controls">
      <button
        className="secondary-button"
        type="button"
        aria-expanded={open}
        onClick={() => setOpen(!open)}
      >
        {zh ? "后端管理" : "Backend controls"}
      </button>
      {open && (
        <section
          className="backend-controls-panel"
          aria-label={zh ? "后端启停" : "Backend power"}
        >
          <header>
            <strong>{zh ? "按需启用" : "Enable on demand"}</strong>
            <button
              type="button"
              className="text-button"
              aria-label={zh ? "关闭后端面板" : "Close backend panel"}
              onClick={() => setOpen(false)}
            >
              ×
            </button>
          </header>
          <p>
            {zh
              ? "默认关闭。开启后，仅在递交任务时加载；任务结束后释放进程。"
              : "Off by default. Models load only for submitted tasks; task processes exit when finished."}
          </p>
          <BackendStateMessage
            runtime={runtime}
            language={language}
            failed={Boolean(runtime.failed)}
          />
          {!runtime.catalogue && !runtime.readError && (
            <p role="status">{zh ? "正在读取…" : "Loading…"}</p>
          )}
          <div className="backend-controls-list">
            {runtime.catalogue?.engines.map((item) => (
              <RuntimeSwitch
                key={item.id}
                item={item}
                language={language}
                runtime={runtime}
              />
            ))}
            <ComputeSwitch
              language={language}
              configuredOnly
              activity={computeActivity(harness, runtime.readError)}
            />
          </div>
        </section>
      )}
    </div>
  );
}
