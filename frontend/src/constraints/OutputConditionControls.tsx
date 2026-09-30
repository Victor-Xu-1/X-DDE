import type { Language } from "../types";
import type { Condition, OutputSettings } from "./types";
export function OutputConditionControls({
  language,
  choice,
  onChoice,
  expert,
  settings,
  onSettings,
  conditions = [],
}: {
  language: Language;
  choice: "none" | "heavy_atom_centroid" | "all_heavy_atoms";
  onChoice(value: "none" | "heavy_atom_centroid" | "all_heavy_atoms"): void;
  expert: boolean;
  settings: OutputSettings;
  onSettings?(value: OutputSettings): void;
  conditions?: Condition[];
}) {
  const zh = language === "zh";
  return (
    <>
      <label
        className="field"
        title={
          zh
            ? "按真实输出坐标检查，不引导搜索；选择后需保存条件版本。"
            : "Checks actual output coordinates without search guidance; save a revision after choosing."
        }
      >
        {zh
          ? "计算结束后检查什么？"
          : "What should be checked after calculation?"}
        <select
          value={choice}
          onChange={(e) => onChoice(e.target.value as typeof choice)}
        >
          <option value="none">
            {zh ? "不添加空间结果条件" : "No spatial output condition"}
          </option>
          <option value="heavy_atom_centroid">
            {zh
              ? "检查重原子中心是否在范围内"
              : "Check whether the heavy-atom centroid is inside"}
          </option>
          <option value="all_heavy_atoms">
            {zh
              ? "检查全部重原子是否在范围内"
              : "Check whether all heavy atoms are inside"}
          </option>
        </select>
      </label>
      {choice !== "none" && (
        <p className="field-help">
          {settings.strength === "hard"
            ? zh
              ? "必须满足；失败候选不会自动复用"
              : "Required; failed candidates are not handed off automatically"
            : zh
              ? "仅记录偏离；不会排除候选"
              : "Record deviations without excluding candidates"}{" "}
          · {zh ? "数值容差" : "Numerical tolerance"}{" "}
          {settings.tolerance_angstrom} Å
        </p>
      )}
      {expert && choice !== "none" && onSettings && (
        <div className="operation-grid">
          <label className="field">
            {zh ? "条件强度" : "Condition strength"}
            <select
              value={settings.strength}
              onChange={(e) =>
                onSettings({
                  ...settings,
                  strength: e.target.value as OutputSettings["strength"],
                })
              }
            >
              <option value="hard">{zh ? "必须满足" : "Required"}</option>
              <option value="soft">
                {zh ? "仅记录偏离" : "Record deviations only"}
              </option>
            </select>
          </label>
          <label
            className="field"
            title={
              zh
                ? "显式记录的小范围数值容差，不隐藏放宽条件。"
                : "Explicit numerical padding recorded in the condition, never hidden relaxation."
            }
          >
            {zh ? "数值容差 (Å)" : "Numerical tolerance (Å)"}
            <input
              type="number"
              min={0}
              max={0.1}
              step={0.001}
              value={
                Number.isFinite(settings.tolerance_angstrom)
                  ? settings.tolerance_angstrom
                  : ""
              }
              onChange={(e) =>
                onSettings({
                  ...settings,
                  tolerance_angstrom:
                    e.target.value === "" ? NaN : Number(e.target.value),
                })
              }
            />
          </label>
          {settings.strength === "soft" && (
            <label
              className="field"
              title={
                zh
                  ? "只用于加权几何偏差统计，不参与对接搜索或能量评分。"
                  : "Weights geometric deviation statistics only, not docking search or energy scoring."
              }
            >
              {zh ? "偏差统计权重" : "Deviation weight"}
              <input
                type="number"
                min={0.001}
                max={1000}
                step={0.1}
                value={Number.isFinite(settings.weight) ? settings.weight : ""}
                onChange={(e) =>
                  onSettings({
                    ...settings,
                    weight:
                      e.target.value === "" ? NaN : Number(e.target.value),
                  })
                }
              />
            </label>
          )}
        </div>
      )}
      {conditions
        .filter((c) => c.kind === "spatial_bounds")
        .map((c) => (
          <p className="field-help" key={c.id}>
            {zh ? "已保存结果范围" : "Saved output bounds"}:{" "}
            {c.kind === "spatial_bounds" && (
              <>
                {c.box.center.join(", ")} Å · {c.box.size.join(" × ")} Å ·{" "}
                {zh ? "容差" : "Tolerance"} {c.tolerance_angstrom} Å
              </>
            )}
          </p>
        ))}
    </>
  );
}
