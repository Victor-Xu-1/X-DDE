import { Hint } from "../guided/Hint";
import type { Language } from "../types";
export interface NativePoseScore {
  value: number;
  unit: "kcal/mol";
  method: string;
  scoring?: string;
  scope: "whole_pose";
}
/** Show exact native scores without manufacturing per-residue or force values. */
export function PoseScore({
  value,
  language,
}: {
  value?: NativePoseScore | null;
  language: Language;
}) {
  const zh = language === "zh";
  const valid =
    value?.scope === "whole_pose" &&
    value.unit === "kcal/mol" &&
    Number.isFinite(value.value) &&
    value.method;
  if (!valid) return null;
  return (
    <div className="pose-score">
      {valid && (
        <span>
          {zh ? "整体对接评分" : "Whole-pose docking score"}:{" "}
          <strong>
            {value.value.toFixed(3)} {value.unit}
          </strong>
          <small>
            {value.method}
            {value.scoring ? ` · ${value.scoring}` : ""}
          </small>
        </span>
      )}
      <Hint label={zh ? "作用大小说明" : "Interaction magnitude help"}>
        {zh
          ? "整体对接评分是原生模型对这一个姿势的评分，数值越低通常表示该模型评分越有利，只适用于相同方法和条件下比较候选。它不是每个氨基酸的作用能，也不是实测结合力或亲和力。当前没有逐残基能量分解结果；距离不转换成强、中、弱。"
          : "The native docking score applies to this entire pose. Lower values usually favor a pose within the same model and conditions. It is not a per-residue energy, measured force or affinity. Per-residue decomposition is unavailable here; distances are never converted into strong/moderate/weak labels."}
      </Hint>
    </div>
  );
}
