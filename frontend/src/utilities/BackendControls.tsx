import { useId, useRef, useState } from "react";
import type { Language } from "../types";
import type { ResearchModule } from "../studio/research-modules";
import { enginesForScope } from "./backend-control-scope";
import { computeActivity, ComputeSwitch } from "./ComputeSwitch";
import { useBackendRuntime } from "./backend-runtime";
import { BackendStateMessage, RuntimeSwitch } from "./RuntimeSwitch";
import "./runtime-switch.css";

export function BackendControls({
  language,
  module,
}: {
  language: Language;
  module?: Pick<ResearchModule, "label" | "tools">;
}) {
  const zh = language === "zh";
  const [open, setOpen] = useState(false);
  const [showAll, setShowAll] = useState(false);
  const trigger = useRef<HTMLButtonElement>(null);
  const panelId = useId();
  const capabilities = showAll ? undefined : module?.tools;
  const runtime = useBackendRuntime(open, capabilities, !capabilities);
  const rows = capabilities
    ? enginesForScope(runtime.catalogue, { capabilities })
    : (runtime.catalogue?.engines ?? []);
  const harness = rows.find((row) => row.id === "harness");
  const index = zh ? 0 : 1;
  const heading = capabilities
    ? module?.label[zh ? 0 : 1]
    : zh
      ? "所有后端"
      : "All backends";
  const label = capabilities
    ? zh
      ? "本模块的后端"
      : "Backends in this module"
    : zh
      ? "后端启停"
      : "Backend power";
  function close() {
    setOpen(false);
    setShowAll(false);
    trigger.current?.focus();
  }
  return (
    <div
      className="backend-controls"
      onKeyDown={(event) => {
        if (open && event.key === "Escape") {
          event.stopPropagation();
          close();
        }
      }}
    >
      <button
        ref={trigger}
        className="secondary-button"
        type="button"
        aria-expanded={open}
        aria-controls={open ? panelId : undefined}
        onClick={() => (open ? close() : setOpen(true))}
      >
        {zh ? "后端管理" : "Backend controls"}
      </button>
      {open && (
        <section
          id={panelId}
          className="backend-controls-panel"
          aria-label={label}
        >
          <header>
            <strong>{heading}</strong>
            <button
              type="button"
              className="text-button"
              aria-label={zh ? "关闭后端面板" : "Close backend panel"}
              onClick={close}
            >
              ×
            </button>
          </header>
          <p>
            {zh
              ? "默认关闭。各任务页共用同一后端状态。"
              : "Off by default. Tasks that use the same backend share its switch."}
          </p>
          <BackendStateMessage
            runtime={runtime}
            language={language}
            failed={rows.some((row) => row.id === runtime.failed)}
          />
          {!runtime.catalogue && !runtime.readError && (
            <p role="status">{zh ? "正在读取…" : "Loading…"}</p>
          )}
          <div className="backend-controls-list">
            {rows.map((item) => (
              <RuntimeSwitch
                key={item.id}
                item={item}
                language={language}
                runtime={runtime}
              />
            ))}
            {(harness || !capabilities) && (
              <ComputeSwitch
                language={language}
                configuredOnly={!capabilities}
                activity={computeActivity(harness, runtime.readError)}
              />
            )}
          </div>
          {module && (
            <button
              type="button"
              className="text-button"
              onClick={() => setShowAll((value) => !value)}
            >
              {
                (showAll
                  ? ["返回本模块", "Back to this module"]
                  : ["查看全部后端", "View all backends"])[index]
              }
            </button>
          )}
        </section>
      )}
    </div>
  );
}
