import { useState } from "react";
import { LoadingOutlined } from "@ant-design/icons";
import type { Language } from "../types";
import type { usePoseOptimization } from "./usePoseOptimization";
import { poseError } from "./pose-errors";

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
  return (
    <div
      className="viewer-message initial-pose-status"
      role={failed ? "alert" : "status"}
    >
      {state.busy && <LoadingOutlined spin />}
      <strong>
        {failed
          ? zh
            ? "三维构象尚未准备好"
            : "3D conformer is not ready"
          : zh
            ? "正在准备优化后的三维构象…"
            : "Preparing an optimized 3D conformer…"}
      </strong>
      <span>
        {failed
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
