import type { Language } from "../types";
import type { Support } from "./types";
import { reasons } from "./model";
export function ConstraintSupportSummary({
  support,
  language,
}: {
  support: Support;
  language: Language;
}) {
  const zh = language === "zh";
  return (
    <>
      {support && (
        <div role="status">
          <strong>
            {support.executable
              ? zh
                ? "条件与任务匹配"
                : "Conditions match this task"
              : zh
                ? "条件不能用于当前任务"
                : "Conditions cannot run on this task"}
          </strong>
          <ul>
            {support.conditions.map((c) => (
              <li key={c.condition_id}>
                {reasons[c.reason_code]?.[zh ? 0 : 1] ?? c.reason} ·{" "}
                {c.support === "result_check"
                  ? zh
                    ? "仅结果检查"
                    : "Output checking only"
                  : c.supported
                    ? zh
                      ? "原生执行"
                      : "Native execution"
                    : zh
                      ? "不支持"
                      : "Unsupported"}
              </li>
            ))}
          </ul>
          <p className="field-help">
            {support.conditions.some(
              (c) => c.independent_result_check === "rdkit_receptor_bounds_v1",
            )
              ? zh
                ? "已启用独立空间结果检查；不等于结合模式或完整质量已合格。"
                : "Independent spatial output checking is enabled; binding or full pose quality is not established."
              : zh
                ? "未设置独立空间结果条件；不标记为结果已合格。"
                : "No independent spatial output condition; output qualification is not claimed."}
          </p>
        </div>
      )}
    </>
  );
}
