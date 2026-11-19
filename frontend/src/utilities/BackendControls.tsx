import { useEffect, useId, useRef, useState } from "react";
import { ControlOutlined } from "@ant-design/icons";
import type { Language } from "../types";
import type { ResearchModule } from "../studio/research-modules";
import { enginesForScope } from "./backend-control-scope";
import {
  computeActivity,
  ComputeSwitch,
  useComputePower,
} from "./ComputeSwitch";
import { useBackendRuntime } from "./backend-runtime";
import { BackendStateMessage, RuntimeSwitch } from "./RuntimeSwitch";
import {
  RecognitionBackendEntry,
  useRecognitionStatus,
} from "./RecognitionBackendEntry";
import "./runtime-switch.css";

export function BackendControls({
  language,
  module,
  placement,
  moduleHasRecognition = false,
  onOpenRecognition,
}: {
  language: Language;
  module?: Pick<ResearchModule, "label" | "tools">;
  placement?: "module";
  moduleHasRecognition?: boolean;
  onOpenRecognition?(): void;
}) {
  const zh = language === "zh";
  const local = placement === "module";
  const triggerLabel = local
    ? zh
      ? "本模块后端"
      : "Module backends"
    : zh
      ? "后端管理"
      : "Backend controls";
  const [panel, setPanel] = useState<"closed" | "module" | "all">("closed");
  const open = panel !== "closed";
  const showAll = panel === "all";
  const container = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const panelClose = useRef<HTMLButtonElement>(null);
  const panelId = useId();
  const statusId = useId();
  const capabilities = showAll ? undefined : module?.tools;
  const showRecognition = Boolean(
    onOpenRecognition && (moduleHasRecognition || !capabilities),
  );
  const recognitionPower = useRecognitionStatus(
    showRecognition && (moduleHasRecognition || open),
  );
  const { status: recognition } = recognitionPower;
  const runtime = useBackendRuntime(
    Boolean(module) || open,
    open ? capabilities : undefined,
    open && !capabilities,
  );
  const rows = capabilities
    ? enginesForScope(runtime.catalogue, { capabilities })
    : (runtime.catalogue?.engines ?? []);
  const harness = rows.find((row) => row.id === "harness");
  const moduleRows = module
    ? enginesForScope(runtime.catalogue, { capabilities: module.tools })
    : [];
  const compute = useComputePower();
  const moduleUsesCompute = moduleRows.some((row) => row.id === "harness");
  const activeCompute = moduleUsesCompute && Boolean(compute?.service?.running);
  const reading = !runtime.catalogue || (moduleUsesCompute && compute?.loading);
  const unavailable =
    runtime.readError ||
    (moduleUsesCompute && compute?.unavailable) ||
    (moduleHasRecognition &&
      recognition?.available !== false &&
      !recognition?.power);
  const activeCount =
    moduleRows.filter((row) => row.enabled).length +
    Number(activeCompute) +
    Number(moduleHasRecognition && recognition?.power?.enabled === true);
  const power =
    unavailable || reading || !moduleRows.length
      ? "unknown"
      : activeCount
        ? "on"
        : "off";
  const status = {
    on: zh ? `${activeCount} 个后端已开启` : `${activeCount} on`,
    off: zh ? "任务引擎已关闭" : "Task engines off",
    unknown:
      reading && !unavailable
        ? zh
          ? "正在读取…"
          : "Reading…"
        : zh
          ? "状态待确认"
          : "State unavailable",
  }[power];
  const index = zh ? 0 : 1;
  const heading = capabilities
    ? module?.label[zh ? 0 : 1]
    : zh
      ? "所有后端"
      : "All backends";
  const label = local
    ? zh
      ? "任务结果后端"
      : "Backends for these task results"
    : capabilities
      ? zh
        ? "本模块的后端"
        : "Backends in this module"
      : zh
        ? "后端启停"
        : "Backend power";
  useEffect(() => {
    if (!open) return;
    function dismissOutside(event: PointerEvent) {
      if (
        event.target instanceof Node &&
        !container.current?.contains(event.target)
      )
        setPanel("closed");
    }
    document.addEventListener("pointerdown", dismissOutside);
    return () => document.removeEventListener("pointerdown", dismissOutside);
  }, [open]);
  useEffect(() => {
    if (local && open) panelClose.current?.focus();
  }, [local, open]);
  function close() {
    setPanel("closed");
    trigger.current?.focus();
  }
  if (local && moduleRows.length === 1 && !harness) {
    const [item] = moduleRows;
    return (
      <div
        className="task-backend-control"
        data-backend-placement={placement}
        role="group"
        aria-label={zh ? "本模块后端开关" : "Backend switch for this module"}
      >
        <RuntimeSwitch item={item} language={language} runtime={runtime} />
        <BackendStateMessage
          runtime={runtime}
          language={language}
          failed={runtime.failed === item.id}
        />
      </div>
    );
  }
  return (
    <div
      ref={container}
      className="backend-controls"
      data-backend-placement={placement}
      onBlur={(event) => {
        if (
          open &&
          event.relatedTarget &&
          !event.currentTarget.contains(event.relatedTarget)
        )
          setPanel("closed");
      }}
      onKeyDown={(event) => {
        if (open && event.key === "Escape") {
          event.stopPropagation();
          close();
        }
      }}
    >
      <button
        ref={trigger}
        className="secondary-button backend-controls-trigger"
        type="button"
        aria-label={triggerLabel}
        aria-describedby={module ? statusId : undefined}
        aria-expanded={open}
        aria-controls={open ? panelId : undefined}
        disabled={local && !runtime.catalogue && !runtime.readError}
        onClick={() => (open ? close() : setPanel("module"))}
      >
        <ControlOutlined className="backend-controls-icon" aria-hidden="true" />
        <span className="backend-controls-label">{triggerLabel}</span>
        {module && (
          <span
            id={statusId}
            className="backend-module-status"
            data-power={power}
            aria-live="polite"
            title={status}
          >
            <span>{status}</span>
          </span>
        )}
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
              ref={panelClose}
              type="button"
              className="text-button"
              aria-label={zh ? "关闭后端面板" : "Close backend panel"}
              onClick={close}
            >
              ×
            </button>
          </header>
          {!local && (
            <p>
              {zh
                ? "默认关闭。各任务页共用同一后端状态。"
                : "Off by default. Tasks that use the same backend share its switch."}
            </p>
          )}
          <BackendStateMessage
            runtime={runtime}
            language={language}
            failed={rows.some((row) => row.id === runtime.failed)}
          />
          {!runtime.catalogue && !runtime.readError && (
            <p role="status">{zh ? "正在读取…" : "Loading…"}</p>
          )}
          <div className="backend-controls-list">
            {showRecognition && onOpenRecognition && (
              <RecognitionBackendEntry
                language={language}
                powerControl={recognitionPower}
                onOpen={() => {
                  setPanel("closed");
                  onOpenRecognition();
                }}
              />
            )}
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
          {module && !local && (
            <button
              type="button"
              className="text-button"
              onClick={() => setPanel(showAll ? "module" : "all")}
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
