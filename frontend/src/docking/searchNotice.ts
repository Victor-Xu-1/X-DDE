import type { Language } from "../types";
import type { DockingResult } from "./types";

export function searchReviewNotice(language: Language): string {
  return language === "zh"
    ? "按所选区域搜索，不再根据分子大小自动扩大；请确认区域足以容纳分子。"
    : "Search uses the chosen region without automatic expansion for ligand size. Ensure the region is large enough for the molecule.";
}

/** Historical outputs lack an engine-reported box and must remain distinguishable. */
export function searchNotice(
  language: Language,
  report?: DockingResult["search_report"],
): string {
  if (report) {
    const center = report.center.join(" / ");
    const size = report.size.join(" × ");
    return language === "zh"
      ? `引擎报告的搜索框：中心 ${center} Å；尺寸 ${size} Å。数值按日志精度显示；网格离散化和原子位置不等同于硬边界。`
      : `Engine-reported search box: center ${center} Å; size ${size} Å. Values are rounded in the log; grid discretization and atom positions do not constitute a hard boundary.`;
  }
  return language === "zh"
    ? "引擎可能根据分子大小扩大搜索范围；当前结果未记录扩大后的实际范围，请勿将所选区域视为硬边界。"
    : "The engine may expand the search region to fit the molecule. The resulting bounds are not recorded; do not treat the selected region as a hard boundary.";
}
