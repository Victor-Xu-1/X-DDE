import type { Dispatch, SetStateAction } from "react";
import { Hint } from "../guided/Hint";
import type { Language } from "../types";
export function PocketOptions({
  language,
  expert,
  onExpert,
  values,
  setters,
}: {
  language: Language;
  expert: boolean;
  onExpert(): void;
  values: readonly [number, number, number, number, number];
  setters: readonly Dispatch<SetStateAction<number>>[];
}) {
  const zh = language === "zh";
  const labels = zh
    ? ["CPU线程", "内存上限（MiB）", "表面点门槛", "最小点簇", "先展示几个口袋"]
    : [
        "CPU threads",
        "Memory limit (MiB)",
        "Surface-point threshold",
        "Minimum cluster size",
        "Pocket review limit",
      ];
  const bounds = [
    [1, 32],
    [512, 8192],
    [0, 1],
    [1, 100],
    [1, 100],
  ];
  return (
    <>
      <label className="field">
        {zh
          ? "先查看多少个候选口袋？"
          : "How many candidate pockets to review first?"}
        <select
          value={values[4]}
          onChange={(e) => setters[4](Number(e.target.value))}
        >
          <option value={5}>{zh ? "先看前5个" : "Review the first 5"}</option>
          <option value={20}>
            {zh ? "先看前20个（推荐）" : "Review the first 20 (recommended)"}
          </option>
          <option value={100}>
            {zh ? "尽量保留更多，最多100个" : "Retain more, up to 100"}
          </option>
          {![5, 20, 100].includes(values[4]) && (
            <option value={values[4]}>{values[4]}</option>
          )}
        </select>
      </label>
      <Hint label={zh ? "口袋检测说明" : "Pocket detection help"}>
        {zh
          ? "这是蛋白表面的候选结合位置，不代表分子一定结合。检测分数和模型概率不是实验活性或亲和力；截取前若干结果不代表其余位点不存在。"
          : "Candidate locations on protein surfaces, not proof of binding. Scores/probabilities are not experimental affinity or activity; reviewing a subset does not imply other sites are absent."}
      </Hint>
      <button
        type="button"
        className="secondary-button"
        aria-pressed={expert}
        onClick={onExpert}
      >
        {zh ? "专家微调" : "Expert tuning"}
      </button>
      {expert && (
        <div className="operation-grid">
          {values.map((value, i) => (
            <label className="field" key={labels[i]}>
              {labels[i]}
              <input
                type="number"
                required
                value={value}
                min={bounds[i][0]}
                max={bounds[i][1]}
                step={i === 2 ? 0.01 : 1}
                onChange={(e) => setters[i](Number(e.target.value))}
              />
            </label>
          ))}
        </div>
      )}
    </>
  );
}
