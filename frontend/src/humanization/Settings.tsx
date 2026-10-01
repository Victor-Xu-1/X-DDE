import { ChoiceCards } from "../guided/ChoiceCards";
import { Hint } from "../guided/Hint";
import type { Language } from "../types";
import type { HumanizationOptions } from "./types";

export function HumanizationSettings({
  language,
  options,
  onChange,
  name,
  onName,
}: {
  language: Language;
  options: HumanizationOptions;
  onChange(value: HumanizationOptions): void;
  name: string;
  onName(value: string): void;
}) {
  const zh = language === "zh";
  return (
    <>
      <ChoiceCards<HumanizationOptions["mode"]>
        label={zh ? "这次需要做什么？" : "What should this task do?"}
        value={options.mode}
        onChange={(mode) =>
          onChange({
            ...options,
            mode,
            max_mutations: mode === "evaluate" ? 0 : 3,
            iterations: 1,
          })
        }
        options={[
          {
            value: "evaluate",
            title: zh ? "只评估，不修改" : "Evaluate unchanged sequences",
            note: zh
              ? "查看 Sapiens 和人类 OAS 肽段参考结果。"
              : "Review Sapiens and human OAS peptide-reference results.",
          },
          ...(options.format === "conventional"
            ? [
                {
                  value: "framework" as const,
                  title: zh ? "生成框架修改建议" : "Propose framework changes",
                  note: zh
                    ? "保留 CDR 和原有半胱氨酸，候选保存为新版本。"
                    : "Preserve CDRs and original cysteines; save candidates as new versions.",
                },
              ]
            : []),
        ]}
      />
      {options.mode === "framework" && (
        <ChoiceCards<string>
          label={
            zh ? "希望改动多少？" : "How many changes should be considered?"
          }
          value={
            options.max_mutations === 3 && options.iterations === 1
              ? "conservative"
              : options.max_mutations === 5 && options.iterations === 2
                ? "balanced"
                : "expert"
          }
          onChange={(value) =>
            value === "expert"
              ? undefined
              : onChange({
                  ...options,
                  max_mutations: value === "conservative" ? 3 : 5,
                  iterations: value === "conservative" ? 1 : 2,
                })
          }
          options={[
            {
              value: "conservative",
              title: zh ? "少量改动（推荐）" : "Few changes (recommended)",
              note: zh
                ? "最多 3 处，评估 1 轮。"
                : "At most 3 positions and 1 round.",
            },
            {
              value: "balanced",
              title: zh ? "适度探索" : "Moderate exploration",
              note: zh
                ? "最多 5 处，评估 2 轮。"
                : "At most 5 positions and 2 rounds.",
            },
            ...((options.max_mutations === 3 && options.iterations === 1) ||
            (options.max_mutations === 5 && options.iterations === 2)
              ? []
              : [
                  {
                    value: "expert",
                    title: zh ? "正在使用专家参数" : "Using expert parameters",
                    note: zh
                      ? `最多 ${options.max_mutations} 处，${options.iterations} 轮。`
                      : `At most ${options.max_mutations} positions, ${options.iterations} rounds.`,
                  },
                ]),
          ]}
        />
      )}
      <Hint label={zh ? "这些数值代表什么？" : "What do these scores mean?"}>
        {zh
          ? "Sapiens 给出原生残基概率；OAS 检查 9 个残基的肽段是否出现在固定人类参考中。它们不等同于临床免疫原性、结合保留或成药性。"
          : "Sapiens reports native residue probabilities; OAS checks exact 9-residue matches in a fixed human reference. These are not clinical immunogenicity, retained binding or developability."}
      </Hint>
      <details>
        <summary>{zh ? "专家微调" : "Expert settings"}</summary>
        {options.mode === "framework" && (
          <>
            <label className="field">
              {zh
                ? "最多修改的原始位置数"
                : "Maximum changed original positions"}
              <input
                type="number"
                min={1}
                max={20}
                step={1}
                value={options.max_mutations}
                onChange={(e) =>
                  onChange({
                    ...options,
                    max_mutations: Number(e.target.value),
                  })
                }
              />
            </label>
            <label className="field">
              {zh ? "最多评估轮数" : "Maximum rounds"}
              <select
                value={options.iterations}
                onChange={(e) =>
                  onChange({ ...options, iterations: Number(e.target.value) })
                }
              >
                {[1, 2, 3, 4].map((value) => (
                  <option value={value} key={value}>
                    {value}
                  </option>
                ))}
              </select>
            </label>
          </>
        )}
        <label className="field">
          CPU
          <select
            value={options.cpu}
            onChange={(e) =>
              onChange({ ...options, cpu: Number(e.target.value) })
            }
          >
            {[1, 2].map((value) => (
              <option value={value} key={value}>
                {value}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          {zh ? "内存预算" : "Memory budget"}
          <select
            value={options.memory_mib}
            onChange={(e) =>
              onChange({ ...options, memory_mib: Number(e.target.value) })
            }
          >
            {[2048, 4096, 8192].map((value) => (
              <option value={value} key={value}>
                {value / 1024} GiB
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          {zh ? "任务名称（可选）" : "Task name (optional)"}
          <input
            value={name}
            maxLength={80}
            onChange={(e) => onName(e.target.value)}
          />
        </label>
      </details>
    </>
  );
}
