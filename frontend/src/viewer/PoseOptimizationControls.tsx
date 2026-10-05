import { useState } from "react";
import { LoadingOutlined, UndoOutlined } from "@ant-design/icons";
import { Hint } from "../guided/Hint";
import type { Language } from "../types";
import type { usePoseOptimization } from "./usePoseOptimization";
import { poseError } from "./pose-errors";
import "./pose-optimization.css";

export function PoseOptimizationControls({
  state,
  language,
  disabled,
}: {
  state: ReturnType<typeof usePoseOptimization>;
  language: Language;
  disabled: boolean;
}) {
  const zh = language === "zh",
    bound = Boolean(state.pose.receptor);
  const [method, setMethod] = useState<"MMFF94s" | "UFF">("MMFF94s");
  const [iterations, setIterations] = useState(1000);
  if (!state.pose.source) return null;
  const phase = state.phase;
  const label =
    phase === "saving"
      ? zh
        ? "正在保存 pose…"
        : "Saving pose…"
      : phase === "queued"
        ? zh
          ? "等待计算…"
          : "Queued…"
        : phase === "cancelling"
          ? zh
            ? "正在取消…"
            : "Cancelling…"
          : state.busy
            ? zh
              ? "正在最小化…"
              : "Minimizing…"
            : bound
              ? zh
                ? "受体内最小化"
                : "Minimize in receptor"
              : zh
                ? "能量最小化"
                : "Minimize energy";
  return (
    <div
      className="pose-optimization"
      aria-label={zh ? "pose 优化与历史" : "Pose optimization and history"}
    >
      <div className="pose-optimization-actions">
        <button
          type="button"
          className="primary-button"
          disabled={disabled || state.busy}
          onClick={() => void state.minimize(method, iterations)}
        >
          {state.busy && <LoadingOutlined spin />}
          {label}
        </button>
        <Hint label={zh ? "最小化说明" : "Minimization help"}>
          {bound
            ? zh
              ? "以当前显示的受体和配体坐标执行 GNINA 局部最小化；受体不移动。点击即确认此配体位于该受体坐标系。合格的新 pose 自动保存，旧 pose 保留。"
              : "GNINA locally minimizes this ligand in the displayed receptor, which stays fixed. Clicking confirms this receptor coordinate frame. Qualified poses are saved separately."
            : zh
              ? "从当前三维坐标开始优化，默认 MMFF94s。只补齐隐式氢，不改变质子化状态、不重新生成构象。新 pose 自动保存，原始文件保留；该能量不是结合亲和力。"
              : "Optimize the current coordinates with MMFF94s by default. Complete implicit hydrogens without changing protonation or generating a new conformer. Save a separate pose; this energy is not affinity."}
        </Hint>
        {state.count > 1 && (
          <>
            <button
              type="button"
              className="secondary-button"
              disabled={state.busy || state.cursor === 0}
              onClick={state.previous}
            >
              <UndoOutlined />
              {zh ? "回到上一个 pose" : "Previous pose"}
            </button>
            {state.cursor < state.count - 1 && (
              <button
                type="button"
                className="secondary-button"
                disabled={state.busy}
                onClick={state.next}
              >
                {zh ? "下一个 pose" : "Next pose"}
              </button>
            )}
            <span className="pose-version-label">
              pose {state.cursor + 1}/{state.count}
              {state.pose.versionId ? (zh ? " · 已保存" : " · Saved") : ""}
            </span>
          </>
        )}
        {state.pose.versionId && (
          <a
            className="secondary-button"
            href={state.downloadUrl}
            download="X-DDE-pose.sdf"
          >
            {zh ? "下载当前 pose" : "Download current pose"}
          </a>
        )}
        {state.busy && phase !== "saving" && phase !== "submitting" && (
          <button
            type="button"
            className="secondary-button"
            disabled={phase === "cancelling"}
            onClick={() => void state.cancel()}
          >
            {zh ? "取消" : "Cancel"}
          </button>
        )}
        <details className="pose-settings">
          <summary>{zh ? "最小化设置" : "Minimization settings"}</summary>
          <div>
            {!bound && (
              <label>
                {zh ? "计算方法" : "Force field"}
                <select
                  value={method}
                  disabled={state.busy}
                  onChange={(e) =>
                    setMethod(e.target.value as "MMFF94s" | "UFF")
                  }
                >
                  <option value="MMFF94s">
                    MMFF94s · {zh ? "推荐" : "Recommended"}
                  </option>
                  <option value="UFF">UFF</option>
                </select>
              </label>
            )}
            <label>
              {zh ? "优化程度" : "Optimization budget"}
              <select
                value={iterations}
                disabled={state.busy}
                onChange={(e) => setIterations(Number(e.target.value))}
              >
                <option value="300">
                  {zh ? "快速 · 300 步" : "Quick · 300 iterations"}
                </option>
                <option value="1000">
                  {zh ? "标准 · 1000 步" : "Standard · 1000 iterations"}
                </option>
                <option value="2000">
                  {zh ? "充分 · 2000 步" : "Extended · 2000 iterations"}
                </option>
              </select>
            </label>
          </div>
        </details>
      </div>
      {state.pose.energy && (
        <p className="pose-energy" role="status">
          <span>
            {state.pose.energy.method} ·{" "}
            {zh ? "分子内能量" : "Intramolecular energy"}
          </span>
          <strong>
            {state.pose.energy.before.toFixed(2)} →{" "}
            {state.pose.energy.after.toFixed(2)} kcal/mol
          </strong>
          <span>
            {state.pose.energy.converged
              ? zh
                ? "已收敛"
                : "Converged"
              : zh
                ? "已保存 · 尚未收敛"
                : "Saved · Not converged"}
          </span>
        </p>
      )}
      {Boolean(state.error) && (
        <div className="pose-optimization-error" role="alert">
          {poseError(state.error, zh)}
          {state.job && phase === "error" && (
            <button type="button" onClick={state.refresh}>
              {zh ? "读取计算进度" : "Refresh progress"}
            </button>
          )}
        </div>
      )}
      {["cancelled", "interrupted"].includes(phase) && (
        <p role="status">
          {zh
            ? "计算已停止，原 pose 保留。"
            : "Computation stopped; the original pose is retained."}
        </p>
      )}
    </div>
  );
}
