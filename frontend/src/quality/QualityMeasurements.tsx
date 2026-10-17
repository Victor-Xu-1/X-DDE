import type { Language } from "../types";
import type { PoseQualityResult } from "./types";

/** Selected native diagnostics only; never fit coordinates or infer missing values. */
export function QualityMeasurements({
  result,
  language,
}: {
  result: PoseQualityResult;
  language: Language;
}) {
  const zh = language === "zh";
  const valid = (key: string) => {
    const value = result.metrics?.[key];
    return typeof value === "number" && Number.isFinite(value) && value >= 0
      ? value
      : null;
  };
  const rows: [string, number | null][] = [];
  if (result.inputs.reference && result.options?.profile === "redock")
    rows.push([
      zh ? "整分子原位 RMSD" : "Whole-molecule RMSD in receptor frame",
      valid("rmsd"),
    ]);
  if (result.inputs.protein)
    rows.push([
      zh ? "最近蛋白重原子距离" : "Nearest protein heavy-atom distance",
      valid("smallest_distance_protein"),
    ]);
  if (!rows.length) return null;
  const fitted = result.inputs.reference ? valid("kabsch_rmsd") : null;
  return (
    <section
      className="quality-measurements"
      aria-label={zh ? "姿势测量" : "Pose measurements"}
    >
      <dl>
        {rows.map(([label, value]) => (
          <div key={label}>
            <dt>{label}</dt>
            <dd>
              {value === null
                ? zh
                  ? "未测得"
                  : "Not measured"
                : `${value.toFixed(2)} Å`}
            </dd>
          </div>
        ))}
      </dl>
      {result.inputs.reference && (
        <p>
          {zh
            ? "原位 RMSD 保留受体坐标系，不做刚体拟合；判定以原始质控检查为准。"
            : "Receptor-frame RMSD uses no rigid-body fitting. Outcomes follow the original quality checks."}
        </p>
      )}
      {fitted !== null && (
        <details>
          <summary>
            {zh ? "拟合后的形状偏差" : "Fitted shape deviation"}
          </summary>
          <p>
            {fitted.toFixed(2)} Å ·{" "}
            {zh
              ? "仅为拟合诊断，不替代原位姿势判定。"
              : "A fitted diagnostic; it does not replace the receptor-frame pose criterion."}
          </p>
        </details>
      )}
    </section>
  );
}
