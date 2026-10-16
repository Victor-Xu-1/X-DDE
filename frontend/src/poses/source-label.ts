import type { Language } from "../types";
import type { Combination } from "./types";

export function poseSourceLabel(value: Combination, language: Language) {
  if (value.source_kind === "defined_search")
    return (
      value.source_label ||
      (language === "zh" ? "指定搜索区域" : "Defined search region")
    );
  return value.pocket_rank == null
    ? language === "zh"
      ? "来源尚未确认"
      : "Source not confirmed"
    : `${language === "zh" ? "口袋" : "Pocket"} ${value.pocket_rank}`;
}
