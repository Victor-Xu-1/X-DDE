import { useContext } from "react";
import { TaskPresentationContext } from "../guided/TaskPresentation";
import type { ToolId } from "../operations/catalog";
import type { Language } from "../types";
import { useBackendRuntime } from "./backend-runtime";
import {
  enginesForScope,
  PrimaryBackendScope,
  type BackendControlScope,
} from "./backend-control-scope";
import { BackendStateMessage, RuntimeSwitch } from "./RuntimeSwitch";
import { computeActivity, ComputeSwitch } from "./ComputeSwitch";
import "./runtime-switch.css";

export function TaskBackendControl({
  language,
  scope,
  active = true,
  placement,
}: {
  language: Language;
  scope: BackendControlScope;
  active?: boolean;
  placement?: "entry" | "followup" | "result" | "example";
}) {
  const primaryScope = useContext(PrimaryBackendScope);
  const runtime = useBackendRuntime(
    active,
    "capability" in scope
      ? scope.capability
      : "capabilities" in scope
        ? scope.capabilities
        : undefined,
    "operations" in scope && scope.operations.includes("harness"),
  );
  if (!active) return null;
  const { catalogue, readError } = runtime;
  const primaryEngines =
    placement === "followup" || placement === "example"
      ? enginesForScope(catalogue, primaryScope)
      : [];
  const rows = enginesForScope(catalogue, scope).filter(
    (row) => !primaryEngines.some((primary) => primary.id === row.id),
  );
  if (catalogue && !rows.length) return null;
  const zh = language === "zh";
  const harness = rows.find((row) => row.id === "harness");
  return (
    <div
      className="task-backend-control"
      data-backend-placement={placement}
      data-capability={"capability" in scope ? scope.capability : undefined}
      role="group"
      aria-label={zh ? "此任务的后端" : "Backend for this task"}
    >
      {rows.map((item) => (
        <RuntimeSwitch
          key={item.id}
          item={item}
          runtime={runtime}
          language={language}
        />
      ))}
      {harness && (
        <ComputeSwitch
          language={language}
          activity={computeActivity(harness, readError)}
        />
      )}
      <BackendStateMessage
        runtime={runtime}
        language={language}
        failed={rows.some((row) => row.id === runtime.failed)}
      />
      {!catalogue && !readError && (
        <span className="task-backend-pending" role="status">
          {zh ? "正在读取后端…" : "Reading backend…"}
        </span>
      )}
    </div>
  );
}

/** Follow-up forms use the destination capability, independent of the source result. */
export function FollowupBackendControl({
  capability,
  language,
}: {
  capability: ToolId;
  language: Language;
}) {
  const active = useContext(TaskPresentationContext)?.active ?? true;
  return (
    <TaskBackendControl
      language={language}
      scope={{ capability }}
      placement="followup"
      active={active}
    />
  );
}
