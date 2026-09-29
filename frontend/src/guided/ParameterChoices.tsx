import { profiles, profileFor } from "./presets";
import { Hint } from "./Hint";
import { translator } from "../i18n";
import type { Language, Parameters } from "../types";
const help = {
  seed: [
    "固定种子便于复现同样的设置；它不是质量等级。",
    "A fixed seed supports reproducibility. It is not a quality level.",
  ],
  samples: [
    "同一输入生成多少个候选构象，不是生成新的化合物。",
    "How many conformers to predict for the same input, not new compounds.",
  ],
  steps: [
    "每个构象的计算步数。通常保留方案默认值。",
    "Computation steps per conformer. Usually keep the preset value.",
  ],
  cycles: [
    "模型反复更新结构的次数。通常保留默认值。",
    "How many structure-update cycles the model uses. Usually keep the default.",
  ],
} as const;
export function ParameterChoices({
  language,
  value,
  onChange,
  hasProtein,
  abagAvailable,
  expert,
}: {
  language: Language;
  value: Parameters;
  onChange(value: Parameters): void;
  hasProtein: boolean;
  abagAvailable: boolean;
  expert: boolean;
}) {
  const zh = language === "zh",
    i = zh ? 0 : 1,
    t = translator(language),
    selected = profileFor(value);
  return (
    <section className="run-choices">
      <h3>
        {zh ? "3 · 选择运行方案" : "3 · Choose a run preset"}{" "}
        <Hint label={zh ? "运行方案说明" : "Run preset help"}>
          {zh
            ? "默认已调好参数。快速试跑计算较少，不适合据此作研究结论；标准和多构象使用同样的单构象设置。"
            : "Parameters are preset. Quick checks use less computation and should not support research conclusions. Standard and comparison use the same settings per conformer."}
        </Hint>
      </h3>
      <div
        className="preset-choices"
        role="radiogroup"
        aria-label={zh ? "运行方案" : "Run preset"}
      >
        {profiles.map((p) => (
          <label
            className={selected === p.id ? "selected" : ""}
            key={p.id}
            title={p.note[i]}
          >
            <input
              type="radio"
              aria-label={p.label[i]}
              name="profile"
              checked={selected === p.id}
              onChange={() =>
                onChange({
                  ...value,
                  ...p.parameters,
                  seed: value.seed,
                  model: value.model,
                })
              }
            />
            <span>
              <strong>{p.label[i]}</strong>
              {selected === p.id && <small>{p.note[i]}</small>}
            </span>
          </label>
        ))}
      </div>
      {selected === "custom" && (
        <p className="small">
          {zh
            ? "当前使用自定义参数；点选上方方案可恢复。"
            : "Using custom parameters. Choose a preset to restore defaults."}
        </p>
      )}
      {expert && (
        <section
          className="parameters expert-parameters"
          aria-label={zh ? "专家参数" : "Expert parameters"}
        >
          <div className="parameter-grid">
            {(
              [
                ["seed", 0, 4294967295],
                ["samples", 1, 8],
                ["steps", 1, 1000],
                ["cycles", 1, 20],
              ] as const
            ).map(([key, min, max]) => (
              <div className="field" key={key}>
                <span>
                  <label htmlFor={key}>{t(key)}</label>
                  <Hint label={t(key) + (zh ? "说明" : " help")}>
                    {help[key][i]}
                  </Hint>
                </span>
                <input
                  id={key}
                  type="number"
                  min={min}
                  max={max}
                  required
                  value={value[key]}
                  onChange={(e) =>
                    onChange({ ...value, [key]: Number(e.target.value) })
                  }
                />
              </div>
            ))}
            <label className="field">
              {t("dtype")}
              <select
                value={value.dtype}
                onChange={(e) =>
                  onChange({
                    ...value,
                    dtype: e.target.value as Parameters["dtype"],
                  })
                }
              >
                <option value="bf16">
                  {zh ? "节省显存 · BF16" : "Memory-saving · BF16"}
                </option>
                <option value="fp32">
                  {zh
                    ? "完整精度 · FP32（占用更多显存）"
                    : "Full precision · FP32 (more memory)"}
                </option>
              </select>
            </label>
            {hasProtein && (abagAvailable || value.model === "abag") && (
              <div className="field">
                <span>
                  <label htmlFor="model">
                    {zh ? "结构模型" : "Structure model"}
                  </label>
                  <Hint label={zh ? "结构模型说明" : "Structure model help"}>
                    {zh
                      ? "普通小分子任务用标准模型。只有抗体–抗原任务才考虑 ABAG，并需本机安装对应权重。"
                      : "Use the standard model for ordinary ligand tasks. ABAG is for antibody–antigen tasks and requires its checkpoint."}
                  </Hint>
                </span>
                <select
                  id="model"
                  value={value.model ?? "standard"}
                  onChange={(e) =>
                    onChange({
                      ...value,
                      model: e.target.value as Parameters["model"],
                    })
                  }
                >
                  <option value="standard">
                    {zh ? "标准模型" : "Standard"}
                  </option>
                  <option value="abag" disabled={!abagAvailable}>
                    {zh ? "抗体–抗原 · ABAG" : "Antibody–antigen · ABAG"}
                  </option>
                </select>
                {!abagAvailable && (
                  <p role="alert">
                    {zh
                      ? "此任务原用的 ABAG 模型当前不可用，请选择标准模型或安装相应权重。"
                      : "This task used ABAG, which is currently unavailable. Select Standard or install the checkpoint."}
                  </p>
                )}
              </div>
            )}
          </div>
          <p className="muted small">{t("resourceNote")}</p>
        </section>
      )}
    </section>
  );
}
