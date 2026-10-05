import type { ScientificPayload, ScientificProgram } from "./types";
import type { Language } from "../types";

export function ExpertChoices({
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
  const zh = language === "zh";
  const fields: [string, string, string, number, number, number][] =
    program === "boltz"
      ? [
          ["recycling_steps", "结构迭代轮数", "Recycling steps", 1, 10, 1],
          ["sampling_steps", "构象采样步数", "Sampling steps", 20, 500, 1],
        ]
      : program === "ligandmpnn"
        ? [
            [
              "temperature",
              "序列采样温度",
              "Sequence sampling temperature",
              0.01,
              1,
              0.01,
            ],
          ]
        : program === "reinvent" && payload.mode === "optimize"
          ? [
              [
                "optimization_steps",
                "优化轮数",
                "Optimization steps",
                5,
                200,
                1,
              ],
            ]
          : program === "openmm"
            ? [
                ["ph", "蛋白质子化 pH", "Protein protonation pH", 2, 12, 0.1],
                [
                  "restraint_kj_mol_nm2",
                  "骨架约束（kJ/mol/nm²）",
                  "Backbone restraint (kJ/mol/nm²)",
                  100,
                  10000,
                  100,
                ],
              ]
            : program === "apbs"
              ? [
                  [
                    "temperature_kelvin",
                    "温度（K）",
                    "Temperature (K)",
                    273.15,
                    330,
                    0.1,
                  ],
                ]
              : program === "chemprop" && payload.mode === "train"
                ? [["epochs", "训练轮数", "Training epochs", 5, 200, 1]]
                : [];
  return (
    <>
      {fields.map(([key, cn, en, min, max, step]) => (
        <label className="field" key={key}>
          {zh ? cn : en}
          <input
            type="number"
            min={min}
            max={max}
            step={step}
            value={Number(payload[key])}
            onChange={(e) => onChange({ [key]: Number(e.target.value) })}
          />
        </label>
      ))}
      {program === "boltzgen" && (
        <div className="inline-fields">
          {[0, 1].map((i) => (
            <label className="field" key={i}>
              {zh
                ? i
                  ? "最大长度"
                  : "最小长度"
                : i
                  ? "Maximum length"
                  : "Minimum length"}
              <input
                type="number"
                min={8}
                max={300}
                value={(payload.length as number[])[i]}
                onChange={(e) =>
                  onChange({
                    length: (payload.length as number[]).map((n, j) =>
                      i === j ? Number(e.target.value) : n,
                    ),
                  })
                }
              />
            </label>
          ))}
        </div>
      )}
      {program === "reinvent" &&
        payload.mode === "optimize" &&
        ["molecular_weight", "logp"].map((key) => (
          <div className="inline-fields" key={key}>
            {[0, 1].map((i) => (
              <label className="field" key={i}>
                {key === "logp" ? "LogP" : zh ? "分子量" : "Molecular weight"} ·{" "}
                {zh ? (i ? "上限" : "下限") : i ? "Upper" : "Lower"}
                <input
                  type="number"
                  step={0.1}
                  value={(payload[key] as number[])[i]}
                  onChange={(e) =>
                    onChange({
                      [key]: (payload[key] as number[]).map((n, j) =>
                        i === j ? Number(e.target.value) : n,
                      ),
                    })
                  }
                />
              </label>
            ))}
          </div>
        ))}
    </>
  );
}
