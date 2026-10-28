import type { Language } from "../types";

/** The current GNINA adapter does not record the engine-expanded search grid. */
export function searchNotice(language: Language): string {
  return language === "zh"
    ? "引擎可能根据分子大小扩大搜索范围；当前结果未记录扩大后的实际范围，请勿将所选区域视为硬边界。"
    : "The engine may expand the search region to fit the molecule. The resulting bounds are not recorded; do not treat the selected region as a hard boundary.";
}
