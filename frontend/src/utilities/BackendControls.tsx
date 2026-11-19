import { useEffect, useId, useMemo, useRef, useState } from "react";
import { ControlOutlined } from "@ant-design/icons";
import type { Language } from "../types";
import type { ResearchModule } from "../studio/research-modules";
import { enginesForScope } from "./backend-control-scope";
import { useComputePower } from "./ComputeSwitch";
import { BackendPanelList } from "./BackendPanelList";
import { useBackendRuntime } from "./backend-runtime";
import { BackendStateMessage, RuntimeSwitch } from "./RuntimeSwitch";
import { useRecognitionStatus } from "./recognition-power";
import "./runtime-switch.css";

export function BackendControls({
  language,
  module,
  currentCapability,
  inlineSingle = false,
  moduleHasRecognition = false,
  onOpenRecognition,
}: {
  language: Language;
  module?: Pick<
    ResearchModule,
    "label" | "tools" | "followupBackendCapabilities"
  >;
  currentCapability?: string;
  inlineSingle?: boolean;
  moduleHasRecognition?: boolean;
  onOpenRecognition?(): void;
}) {
  const zh = language === "zh";
  const triggerLabel = zh ? "后端管理" : "Backend controls";
  const [panel, setPanel] = useState<"closed" | "module" | "all">("closed");
  const open = panel !== "closed";
  const showAll = panel === "all";
  const container = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const panelClose = useRef<HTMLButtonElement>(null);
  const panelId = useId();
  const statusId = useId();
  const moduleCapabilities = useMemo(
    () =>
      module?.followupBackendCapabilities
        ? [...module.tools, ...module.followupBackendCapabilities]
        : module?.tools,
    [module],
  );
  const capabilities = showAll ? undefined : moduleCapabilities;
  const showRecognition = Boolean(
    onOpenRecognition && (moduleHasRecognition || !capabilities),
  );
  const recognitionPower = useRecognitionStatus(
    showRecognition && (moduleHasRecognition || open),
  );
  const { status: recognition } = recognitionPower;
  const runtime = useBackendRuntime(
    Boolean(module || currentCapability) || open,
    open ? capabilities : currentCapability,
    open && !capabilities,
  );
  const rows = capabilities
    ? enginesForScope(runtime.catalogue, { capabilities })
    : (runtime.catalogue?.engines ?? []);
  const moduleRows = moduleCapabilities
    ? enginesForScope(runtime.catalogue, { capabilities: moduleCapabilities })
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
  // A recovered task can still be active while its session permission is off.
  const activeTasks = moduleRows.some((row) => row.active);
  const power =
    unavailable || reading || !moduleRows.length
      ? "unknown"
      : activeCount || activeTasks
        ? "on"
        : "off";
  const status = {
    on: activeTasks
      ? zh
        ? "有任务正在运行"
        : "Tasks active"
      : zh
        ? `${activeCount} 个后端已开启`
        : `${activeCount} on`,
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
  const label = capabilities
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
    if (module && open) panelClose.current?.focus();
  }, [module, open]);
  function close() {
    setPanel("closed");
    trigger.current?.focus();
  }
  const current = currentCapability
    ? enginesForScope(runtime.catalogue, { capability: currentCapability })[0]
    : undefined;
  const inline =
    current ??
    (inlineSingle &&
    !currentCapability &&
    !moduleHasRecognition &&
    moduleRows.length === 1 &&
    !moduleUsesCompute
      ? moduleRows[0]
      : undefined);
  return (
    <div
      ref={container}
      className={"backend-controls" + (inline ? " has-inline-switch" : "")}
      data-backend-placement={module ? "module" : undefined}
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
      {inline && (
        <div
          className="task-backend-control"
          data-backend-placement={current ? "entry" : undefined}
          data-capability={current ? currentCapability : undefined}
          role="group"
          aria-label={
            current
              ? zh
                ? "此任务的后端"
                : "Backend for this task"
              : zh
                ? "本模块后端开关"
                : "Backend switch for this module"
          }
        >
          <RuntimeSwitch item={inline} language={language} runtime={runtime} />
          {!open && (
            <BackendStateMessage
              runtime={runtime}
              language={language}
              failed={runtime.failed === inline.id}
              focusAfterRetry={() => trigger.current?.focus()}
            />
          )}
        </div>
      )}
      <button
        ref={trigger}
        className="secondary-button backend-controls-trigger"
        type="button"
        aria-label={triggerLabel}
        title={inline ? triggerLabel : undefined}
        aria-describedby={module ? statusId : undefined}
        aria-expanded={open}
        aria-controls={open ? panelId : undefined}
        onClick={() => (open ? close() : setPanel("module"))}
      >
        <ControlOutlined className="backend-controls-icon" aria-hidden="true" />
        <span className="backend-controls-label">
          {inline ? (zh ? "后端" : "Backends") : triggerLabel}
        </span>
        {module && (
          <span
            id={statusId}
            className={inline ? "sr-only" : "backend-module-status"}
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
          {!capabilities && (
            <p>
              {zh
                ? "默认关闭。各任务页共用同一后端状态。"
                : "Off by default. Tasks that use the same backend share its switch."}
            </p>
          )}
          <BackendPanelList
            key={panel + (currentCapability ?? "")}
            runtime={runtime}
            rows={rows}
            capabilities={capabilities}
            currentCapability={currentCapability}
            language={language}
            recognition={recognitionPower}
            onOpenRecognition={
              showRecognition && onOpenRecognition
                ? () => {
                    setPanel("closed");
                    onOpenRecognition();
                  }
                : undefined
            }
            onRetry={() => panelClose.current?.focus()}
          />
          {module && (
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
