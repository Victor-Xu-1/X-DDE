import { useState } from "react";
import { LoadingOutlined } from "@ant-design/icons";
import type { Language } from "../types";
import { useBackendRuntime } from "../utilities/backend-runtime";
import { enginesForScope } from "../utilities/backend-control-scope";
import { TaskBackendControl } from "../utilities/TaskBackendControl";
import type { usePoseOptimization } from "./usePoseOptimization";
import { poseError } from "./pose-errors";

const preparationScope = { operations: ["molecule_minimize"] } as const;

function PreparationBackend({
  language,
  available,
  retry,
  method,
  onMethod,
  prepare,
}: {
  language: Language;
  available: boolean;
  retry: boolean;
  method: "MMFF94s" | "UFF";
  onMethod(value: "MMFF94s" | "UFF"): void;
  prepare(): void;
}) {
  const runtime = useBackendRuntime(true);
  const [backend] = enginesForScope(runtime.catalogue, preparationScope);
  const zh = language === "zh";
  return (
    <div className="initial-pose-actions">
      <TaskBackendControl language={language} scope={preparationScope} />
      {retry && (
        <select
          aria-label={zh ? "三维准备力场" : "3D preparation force field"}
          value={method}
          onChange={(event) =>
            onMethod(event.target.value === "UFF" ? "UFF" : "MMFF94s")
          }
        >
          <option value="MMFF94s">MMFF94s</option>
          <option value="UFF">UFF</option>
        </select>
      )}
      <button
        type="button"
        className="secondary-button"
        disabled={
          !available ||
          !backend?.enabled ||
          !backend.ready ||
          runtime.readError ||
          Boolean(runtime.busy)
        }
        onClick={prepare}
      >
        {retry
          ? zh
            ? "重试"
            : "Retry"
          : zh
            ? "生成三维构象"
            : "Prepare 3D conformer"}
      </button>
    </div>
  );
}

export function InitialPoseStatus({
  state,
  language,
}: {
  state: ReturnType<typeof usePoseOptimization>;
  language: Language;
}) {
  const zh = language === "zh";
  const [method, setMethod] = useState<"MMFF94s" | "UFF">("MMFF94s");
  const failed = ["error", "failed", "cancelled", "interrupted"].includes(
    state.phase,
  );
  const backendOff = state.phase === "backend_off";
  const unavailable = !state.available && !state.busy;
  const [title, description] = unavailable
    ? zh
      ? [
          "新的三维构象暂时无法计算",
          "计算服务恢复后可重试；已计算的结构仍会直接使用，不会重复最小化。",
        ]
      : [
          "New 3D conformers cannot be calculated right now",
          "Retry when the task service recovers. Previously calculated structures are reused without duplicate minimization.",
        ]
    : backendOff
      ? zh
        ? ["三维构象尚未准备", "开启后端后可生成优化构象，原始结构会保留。"]
        : [
            "3D conformer is not prepared",
            "Enable the backend to prepare an optimized conformer. The original structure is retained.",
          ]
      : failed
        ? [
            zh ? "三维构象尚未准备好" : "3D conformer is not ready",
            poseError(state.error || "Minimization did not succeed.", zh),
          ]
        : zh
          ? [
              "正在准备优化后的三维构象…",
              "首次查看会生成构象并最小化能量，原始分子保持不变。",
            ]
          : [
              "Preparing an optimized 3D conformer…",
              "First viewing generates and minimizes a conformer. The original molecule stays unchanged.",
            ];
  return (
    <div
      className="viewer-message initial-pose-status"
      role={failed ? "alert" : "status"}
    >
      {state.busy && <LoadingOutlined spin />}
      <strong>{title}</strong>
      <span>{description}</span>
      {(backendOff || failed) && state.pose.source && (
        <PreparationBackend
          language={language}
          available={state.available}
          retry={failed}
          method={method}
          onMethod={setMethod}
          prepare={() => void state.prepareInitial(method, true)}
        />
      )}
      {state.busy && state.job && state.phase !== "saving" && (
        <button
          className="secondary-button"
          type="button"
          onClick={() => void state.cancel()}
        >
          {zh ? "取消准备" : "Cancel preparation"}
        </button>
      )}
    </div>
  );
}
