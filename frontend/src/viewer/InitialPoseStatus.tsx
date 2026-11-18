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
  prepare,
}: {
  language: Language;
  available: boolean;
  prepare(): void;
}) {
  const runtime = useBackendRuntime(true);
  const [backend] = enginesForScope(runtime.catalogue, preparationScope);
  const zh = language === "zh";
  return (
    <div className="initial-pose-actions">
      <TaskBackendControl language={language} scope={preparationScope} />
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
        {zh ? "生成三维构象" : "Prepare 3D conformer"}
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
  const unavailable = !state.available && !state.busy;
  if (state.phase === "backend_off")
    return (
      <div className="viewer-message initial-pose-status">
        <strong>
          {zh ? "三维构象尚未准备" : "3D conformer is not prepared"}
        </strong>
        <span>
          {zh
            ? "开启后端后可生成优化构象，原始结构会保留。"
            : "Enable the backend to prepare an optimized conformer. The original structure is retained."}
        </span>
        <PreparationBackend
          language={language}
          available={state.available}
          prepare={() => void state.prepareInitial(method, true)}
        />
      </div>
    );
  return (
    <div
      className="viewer-message initial-pose-status"
      role={failed ? "alert" : "status"}
    >
      {state.busy && <LoadingOutlined spin />}
      <strong>
        {unavailable
          ? zh
            ? "新的三维构象暂时无法计算"
            : "New 3D conformers cannot be calculated right now"
          : failed
            ? zh
              ? "三维构象尚未准备好"
              : "3D conformer is not ready"
            : zh
              ? "正在准备优化后的三维构象…"
              : "Preparing an optimized 3D conformer…"}
      </strong>
      <span>
        {unavailable
          ? zh
            ? "计算服务恢复后可重试；已计算的结构仍会直接使用，不会重复最小化。"
            : "Retry when the task service recovers. Previously calculated structures are reused without duplicate minimization."
          : failed
            ? poseError(state.error || "Minimization did not succeed.", zh)
            : zh
              ? "首次查看会生成构象并最小化能量，原始分子保持不变。"
              : "First viewing generates and minimizes a conformer. The original molecule stays unchanged."}
      </span>
      {failed && state.pose.source && (
        <div className="initial-pose-actions">
          <select
            aria-label={zh ? "三维准备力场" : "3D preparation force field"}
            value={method}
            onChange={(event) =>
              setMethod(event.target.value as "MMFF94s" | "UFF")
            }
          >
            <option value="MMFF94s">MMFF94s</option>
            <option value="UFF">UFF</option>
          </select>
          <button
            className="secondary-button"
            type="button"
            disabled={!state.available}
            onClick={() => void state.prepareInitial(method, true)}
          >
            {zh ? "重试" : "Retry"}
          </button>
        </div>
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
