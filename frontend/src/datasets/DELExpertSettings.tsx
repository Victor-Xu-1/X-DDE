import { Hint } from "../guided/Hint";
import type { Language } from "../types";
import { dataDefaults } from "./catalog";

export const delExpertDefaults = {
  max_members: dataDefaults.deli.max_members as number,
  max_reads: dataDefaults.deli.max_reads as number,
  reverse_complement: dataDefaults.deli.reverse_complement as boolean,
  library_errors: dataDefaults.deli.library_errors as number,
  barcode_errors: dataDefaults.deli.barcode_errors as number,
  min_mean_quality: dataDefaults.deli.min_mean_quality as number,
  min_read_length: dataDefaults.deli.min_read_length as number,
  max_read_length: dataDefaults.deli.max_read_length as number,
  max_umis_per_member: dataDefaults.deli.max_umis_per_member as number,
  maximum_series: dataDefaults.deli.maximum_series as number,
  holdout_fraction: dataDefaults.deli.holdout_fraction as number,
  max_training_members: dataDefaults.deli.max_training_members as number,
  trees: dataDefaults.deli.trees as number,
};
export type DELExpertOptions = typeof delExpertDefaults;
export function DELExpertSettings({
  mode,
  language,
  value,
  onChange,
}: {
  mode: string;
  language: Language;
  value: DELExpertOptions;
  onChange(value: DELExpertOptions): void;
}) {
  const zh = language === "zh";
  const field = (
    key: keyof DELExpertOptions,
    labels: [string, string],
    choices: number[],
  ) => (
    <label className="field" key={key}>
      {labels[zh ? 0 : 1]}
      <select
        value={Number(value[key])}
        onChange={(e) => onChange({ ...value, [key]: Number(e.target.value) })}
      >
        {choices.map((choice) => (
          <option key={choice} value={choice}>
            {key === "holdout_fraction"
              ? `${choice * 100}%`
              : choice.toLocaleString()}
          </option>
        ))}
      </select>
    </label>
  );
  return (
    <details className="dataset-expert">
      <summary>{zh ? "专家微调" : "Expert settings"}</summary>
      <div className="dataset-field-grid">
        {mode === "enumerate" &&
          field(
            "max_members",
            ["最多解析成员", "Maximum members"],
            [10000, 100000, 1000000, 10000000],
          )}
        {mode === "decode" && (
          <>
            {field(
              "max_reads",
              ["最多处理读段", "Maximum reads"],
              [1000000, 10000000, 100000000, 1000000000],
            )}
            {field(
              "library_errors",
              ["库标签允许差异", "Library-tag edit tolerance"],
              [0, 1, 2],
            )}
            {field(
              "barcode_errors",
              ["砌块条码允许差异", "Building-block edit tolerance"],
              [0, 1, 2],
            )}
            {field(
              "min_mean_quality",
              ["最低平均质量", "Minimum mean Phred quality"],
              [0, 10, 20, 30],
            )}
            {field(
              "min_read_length",
              ["最短编码读段", "Minimum code-bearing read length"],
              [10, 20, 50, 100],
            )}
            {field(
              "max_read_length",
              ["最长编码读段", "Maximum code-bearing read length"],
              [200, 500, 1000, 5000],
            )}
            <label className="dataset-confirm">
              <input
                type="checkbox"
                checked={value.reverse_complement}
                onChange={(e) =>
                  onChange({ ...value, reverse_complement: e.target.checked })
                }
              />
              {zh
                ? "同时检查反向互补序列"
                : "Check reverse-complement orientation"}
            </label>
            <Hint label={zh ? "纠错方法说明" : "Correction method"}>
              {zh
                ? "由 DELi 原生解码器处理条码差异；无法唯一辨认的读段保留为歧义，UMI 不提前裁剪。"
                : "The native DELi decoder handles barcode edits. Ambiguous reads remain ambiguous; UMIs are preserved."}
            </Hint>
          </>
        )}
        {mode === "count" &&
          field(
            "max_umis_per_member",
            ["单成员 UMI 上限", "UMIs per member budget"],
            [10000, 100000, 1000000],
          )}
        {mode === "series" &&
          field(
            "maximum_series",
            ["显示的系列上限", "Maximum series"],
            [500, 2000, 10000],
          )}
        {mode === "model" && (
          <>
            {field(
              "holdout_fraction",
              ["独立留出比例", "Independent holdout fraction"],
              [0.1, 0.2, 0.3, 0.4],
            )}
            {field(
              "max_training_members",
              ["最多训练结构", "Maximum training structures"],
              [1000, 10000, 50000, 200000],
            )}
            {field(
              "trees",
              ["随机森林树数", "Random-forest trees"],
              [50, 100, 200, 500],
            )}
          </>
        )}
      </div>
    </details>
  );
}
