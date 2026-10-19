import { ChoiceCards } from "../guided/ChoiceCards";
import type { Language } from "../types";

export function UMICountChoices({
  value,
  onChange,
  issue,
  language,
}: {
  value: "directional" | "unique" | "raw";
  onChange(value: "directional" | "unique" | "raw"): void;
  issue: "unassessed" | "undefined" | null;
  language: Language;
}) {
  const zh = language === "zh";
  return (
    <>
      {issue && (
        <p role="status" className="field-help">
          {issue === "undefined"
            ? zh
              ? "此库没有定义 UMI。请选择原始读段计数，不能据此进行分子去重。"
              : "This library has no defined UMI. Select raw-read counts; molecule deduplication is unavailable."
            : zh
              ? "此结果未评估 UMI 完整性。请重新解码后使用 UMI 去重，或明确选择原始读段计数。"
              : "UMI completeness was not assessed. Decode again before UMI deduplication, or explicitly select raw-read counts."}
        </p>
      )}
      <ChoiceCards
        label={zh ? "计数方法" : "Counting method"}
        value={value}
        onChange={onChange}
        options={[
          {
            value: "directional",
            title: zh ? "UMI 纠错 · 推荐" : "UMI correction · Recommended",
            disabled: issue !== null,
            note: zh
              ? "仅对完整 UMI 按样本与成员进行方向图纠错"
              : "Directional correction of complete UMIs within each sample and member",
          },
          {
            value: "unique",
            title: zh ? "独立 UMI" : "Unique UMIs",
            disabled: issue !== null,
            note: zh
              ? "仅统计长度完整、碱基明确的 UMI"
              : "Complete, unambiguous UMIs only",
          },
          {
            value: "raw",
            title: zh ? "仅原始读段" : "Raw reads only",
            note: zh
              ? "保留全部成员识别读段，包含 PCR 偏倚"
              : "Retain all member-identified reads; PCR bias remains",
          },
        ]}
      />
    </>
  );
}
