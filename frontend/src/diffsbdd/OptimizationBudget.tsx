import type { Language } from "../types";
import { optimizationBudgetValid } from "./model";

export function OptimizationBudget({
  value,
  onChange,
  language,
}: {
  value: Record<string, unknown>;
  onChange(next: Record<string, unknown>): void;
  language: Language;
}) {
  const zh = language === "zh";
  const valid = optimizationBudgetValid(value);
  const fields = [
    [
      "population",
      zh ? "每轮比较几个分子？" : "How many molecules per round?",
      100,
    ],
    ["rounds", zh ? "进行几轮优化？" : "How many optimization rounds?", 20],
    [
      "survivors",
      zh ? "每轮保留几个亲本？" : "How many parents should each round retain?",
      Number(value.population),
    ],
  ] as const;
  return (
    <>
      {fields.map(([name, label, maximum]) => (
        <label className="field" key={name}>
          {label}
          <input
            type="number"
            required
            min={1}
            max={maximum}
            step={1}
            value={Number(value[name])}
            onChange={(event) =>
              onChange({ ...value, [name]: Number(event.target.value) })
            }
          />
        </label>
      ))}
      <p
        className={valid ? "field-help" : "notice"}
        role={valid ? undefined : "alert"}
      >
        {valid
          ? zh
            ? `${value.population} 个分子 × ${value.rounds} 轮 = ${Number(value.population) * Number(value.rounds)} 次采样尝试；不保证得到同样数量的有效分子。`
            : `${value.population} molecules × ${value.rounds} rounds = ${Number(value.population) * Number(value.rounds)} sampling attempts; valid molecules may be fewer.`
          : zh
            ? "采样尝试合计最多 100 次；每轮保留亲本数不能超过比较的分子数。"
            : "Use at most 100 sampling attempts; retained parents cannot exceed the molecules per round."}
      </p>
    </>
  );
}
