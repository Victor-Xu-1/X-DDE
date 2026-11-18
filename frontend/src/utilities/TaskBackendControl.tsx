import type { ToolId } from "../operations/catalog";
import type { Language } from "../types";
import { useBackendRuntime } from "./backend-runtime";
import { BackendStateMessage, RuntimeSwitch } from "./RuntimeSwitch";
import "./runtime-switch.css";

type Scope = { capability: string } | { operations: readonly string[] };

export function TaskBackendControl({
  language,
  scope,
  active = true,
  placement,
}: {
  language: Language;
  scope: Scope;
  active?: boolean;
  placement?: "followup" | "result";
}) {
  const runtime = useBackendRuntime(
    active,
    "capability" in scope ? scope.capability : undefined,
    "operations" in scope && scope.operations.includes("harness"),
  );
  if (!active) return null;
  const { catalogue, readError } = runtime;
  const engine =
    "capability" in scope
      ? catalogue?.capabilities?.[scope.capability]
      : undefined;
  const rows =
    catalogue?.engines.filter((row) =>
      "capability" in scope
        ? row.id === engine
        : row.operations?.some((operation) =>
            scope.operations.includes(operation),
          ),
    ) ?? [];
  if (catalogue && !rows.length) return null;
  const zh = language === "zh";
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
  return (
    <TaskBackendControl
      language={language}
      scope={{ capability }}
      placement="followup"
    />
  );
}
