import { PoseList } from "./PoseList";
import type { Language } from "../types";
import type { PoseSet } from "./types";

export function PoseOutcomeList({
  value,
  index,
  pose,
  language,
  onOutcome,
  onPose,
}: {
  value: PoseSet;
  index: number;
  pose: number | null;
  language: Language;
  onOutcome(index: number): void;
  onPose(record: number): void;
}) {
  const zh = language === "zh",
    outcome = value.outcomes[index];
  const labels: Record<string, string> = {
    succeeded: zh ? "有原生结果" : "Native result",
    failed: zh ? "失败" : "Failed",
    cancelled: zh ? "已取消" : "Cancelled",
    interrupted: zh ? "已中断" : "Interrupted",
    missing: zh ? "任务记录缺失" : "Task missing",
    not_attempted: zh ? "尚未尝试" : "Not attempted",
  };
  return (
    <div className="ensemble-result-list">
      <label className="field">
        {zh ? "查看哪个组合？" : "Which combination?"}
        <select
          value={index}
          onChange={(event) => onOutcome(Number(event.target.value))}
        >
          {value.outcomes.map((row, target) => (
            <option key={row.combination.step_id} value={target}>
              {target + 1}. {zh ? "受体 " : "Receptor "}
              {row.combination.member_index + 1} · {zh ? "口袋 " : "Pocket "}
              {row.combination.pocket_rank} · {zh ? "分子 " : "Ligand "}
              {row.combination.ligand_index + 1} ·{" "}
              {labels[row.status] ?? row.status}
            </option>
          ))}
        </select>
      </label>
      {outcome.reason && <p role="status">{outcome.reason}</p>}
      <PoseList
        outcome={outcome}
        selected={pose}
        language={language}
        onSelect={onPose}
      />
      {outcome.job_id && (
        <a href={"/#task=" + encodeURIComponent(outcome.job_id)}>
          {zh ? "查看此组合的原生任务" : "Open this native attempt"}
        </a>
      )}
      <details>
        <summary>{zh ? "计算条件" : "Calculation conditions"}</summary>
        <p className="field-help">
          {zh ? "随机种子" : "Random seed"}: {outcome.combination.seed}
        </p>
        {outcome.initial_conformer_generated === true && (
          <p className="field-help">
            {zh
              ? "原生流程为此输入生成了初始三维构象。"
              : "The native procedure generated an initial three-dimensional conformer."}
          </p>
        )}
      </details>
    </div>
  );
}
