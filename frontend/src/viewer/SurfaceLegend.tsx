import { Hint } from "../guided/Hint";
import { surfaceChargeRange, type SurfaceSummary } from "./protocol";
import type { Language } from "../types";

export function SurfaceLegend({
  summary,
  language,
}: {
  summary: SurfaceSummary | null;
  language: Language;
}) {
  const zh = language === "zh";
  if (!summary)
    return (
      <div className="surface-legend" role="status">
        {zh ? "正在生成电性表面…" : "Generating charge surface…"}
      </div>
    );
  const covered = summary.total - summary.missing;
  return (
    <div className="surface-legend" role="status">
      <strong>
        {summary.estimated > 0
          ? zh
            ? "近似电性"
            : "Approximate charge"
          : zh
            ? "部分电荷"
            : "Partial charge"}
      </strong>
      <span>{zh ? "负电" : "Negative"}</span>
      <span className="surface-charge-scale" aria-hidden="true" />
      <span>{zh ? "正电" : "Positive"}</span>
      {summary.missing > 0 && (
        <span className="surface-charge-missing">
          <i aria-hidden="true" />
          {covered === 0
            ? zh
              ? "暂无电荷数据"
              : "No charge data"
            : zh
              ? "灰色：无数据"
              : "Gray: no data"}
        </span>
      )}
      <Hint label={zh ? "表面电性说明" : "Surface charge help"}>
        {zh
          ? `红色为负、白色接近零、蓝色为正；固定范围 −${surfaceChargeRange} 至 +${surfaceChargeRange} e。覆盖 ${covered}/${summary.total} 个原子：输入部分电荷 ${summary.input}，标准氨基酸表近似 ${summary.estimated}，无数据 ${summary.missing}。灰色不表示中性。这是部分电荷着色，不是 APBS/PB 电势，不考虑 pH、盐浓度和溶剂。`
          : `Red is negative, white near zero, blue positive; fixed range −${surfaceChargeRange} to +${surfaceChargeRange} e. Coverage ${covered}/${summary.total} atoms: ${summary.input} supplied partial charges, ${summary.estimated} standard amino-acid estimates, ${summary.missing} missing. Gray does not mean neutral. Partial-charge coloring is not APBS/PB potential and does not account for pH, salt or solvent.`}
      </Hint>
    </div>
  );
}
