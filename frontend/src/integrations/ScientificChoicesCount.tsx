import type { Language } from "../types";
import type { ScientificPayload, ScientificProgram } from "./types";

const budgets = {
  boltz: { field: "samples", max: 10, presets: [1, 3, 5] },
  ligandmpnn: { field: "candidates", max: 100, presets: [8, 20, 50] },
  reinvent: { field: "candidates", max: 500, presets: [20, 50, 100] },
  boltzgen: { field: "candidates", max: 200, presets: [2, 20, 50, 100] },
} as const;

export function ScientificChoicesCount({
  program,
  payload,
  language,
  onChange,
}: {
  program: ScientificProgram;
  payload: ScientificPayload;
  language: Language;
  onChange(value: Partial<ScientificPayload>): void;
}) {
  if (!(program in budgets)) return null;
  const budget = budgets[program as keyof typeof budgets];
  const zh = language === "zh";
  const value = Number(payload[budget.field]);
  const retained = Number(payload.retain);
  const valid = Number.isInteger(value) && value >= 1 && value <= budget.max;
  return (
    <fieldset className="scientific-plan-budget">
      <legend>{zh ? "生成数量" : "Output budget"}</legend>
      <div className="scientific-plan-grid">
        <label className="field">
          {program === "boltz"
            ? zh
              ? "预测构象数"
              : "Predicted structures"
            : zh
              ? "生成候选数"
              : "Generated candidates"}
          <input
            type="number"
            min={1}
            max={budget.max}
            step={1}
            value={value}
            aria-invalid={!valid}
            onChange={(event) =>
              onChange({ [budget.field]: Number(event.target.value) })
            }
          />
        </label>
        {program === "boltzgen" && (
          <label className="field">
            {zh ? "保留候选数" : "Retained candidates"}
            <input
              type="number"
              min={1}
              max={Math.min(50, value)}
              step={1}
              value={retained}
              aria-invalid={
                !Number.isInteger(retained) ||
                retained < 1 ||
                retained > 50 ||
                retained > value
              }
              onChange={(event) =>
                onChange({ retain: Number(event.target.value) })
              }
            />
          </label>
        )}
      </div>
      <div
        className="scientific-plan-presets"
        role="radiogroup"
        aria-label={zh ? "快捷数量" : "Quick budgets"}
      >
        {budget.presets.map((count) => (
          <label key={count}>
            <input
              type="radio"
              name={`scientific-count-${program}`}
              checked={value === count}
              onChange={() => onChange({ [budget.field]: count })}
            />
            <span>
              {count} {zh ? "个候选" : count === 1 ? "candidate" : "candidates"}
            </span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}
