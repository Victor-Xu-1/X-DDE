import type { Language } from "../types";
import type { ScreenOptions } from "./screen-types";
import { LibraryInspectionChoices } from "./LibraryInspectionChoices";

export function ScreenSettings({
  language,
  options,
  onChange,
  name,
  onName,
}: {
  language: Language;
  options: ScreenOptions;
  onChange(change: Partial<ScreenOptions>): void;
  name: string;
  onName(name: string): void;
}) {
  const zh = language === "zh",
    counts = [10, 20, 50, 100],
    thresholds = [0.4, 0.6, 0.8];
  return (
    <>
      <label className="field">
        {zh ? "最多保留多少个？" : "Maximum selected molecules"}
        <select
          value={options.max_selected}
          onChange={(e) => onChange({ max_selected: Number(e.target.value) })}
        >
          {!counts.includes(options.max_selected) && (
            <option value={options.max_selected}>{options.max_selected}</option>
          )}
          {counts.map((n) => (
            <option key={n} value={n}>
              {n}
            </option>
          ))}
        </select>
      </label>
      {options.mode === "similarity" && (
        <label className="field">
          {zh ? "相似程度" : "Similarity threshold"}
          <select
            value={options.minimum_similarity}
            onChange={(e) =>
              onChange({ minimum_similarity: Number(e.target.value) })
            }
          >
            {!thresholds.includes(options.minimum_similarity) && (
              <option value={options.minimum_similarity}>
                {options.minimum_similarity}
              </option>
            )}
            <option value={0.4}>
              {zh ? "扩大探索：0.4" : "Broader exploration:0.4"}
            </option>
            <option value={0.6}>
              {zh ? "适中：0.6（推荐）" : "Balanced:0.6 (recommended)"}
            </option>
            <option value={0.8}>
              {zh ? "接近参照：0.8" : "Close to query:0.8"}
            </option>
          </select>
        </label>
      )}
      <label className="checkbox-line">
        <input
          type="checkbox"
          checked={options.deduplicate}
          onChange={(e) => onChange({ deduplicate: e.target.checked })}
        />
        {zh
          ? "相同化学结构只保留首次记录"
          : "Keep the first record for exact duplicate chemical structures"}
      </label>
      <LibraryInspectionChoices
        language={language}
        options={options}
        onChange={onChange}
      />
      {options.mode === "filter" && (
        <fieldset>
          <legend>
            {zh
              ? "性质范围（探索用，可修改）"
              : "Descriptor limits (exploratory, editable)"}
          </legend>
          {(
            [
              ["minimum_mw", 0, 5000, "最低分子量", "Minimum molecular weight"],
              ["maximum_mw", 1, 5000, "最高分子量", "Maximum molecular weight"],
              ["minimum_logp", -20, 20, "最低 LogP", "Minimum LogP"],
              ["maximum_logp", -20, 20, "最高 LogP", "Maximum LogP"],
            ] as const
          ).map(([key, min, max, cn, en]) => (
            <label className="field" key={key}>
              {zh ? cn : en}
              <input
                type="number"
                step="any"
                min={min}
                max={max}
                value={options[key]}
                onChange={(e) => onChange({ [key]: Number(e.target.value) })}
              />
            </label>
          ))}
        </fieldset>
      )}
      <details>
        <summary>{zh ? "专家微调" : "Expert settings"}</summary>
        {options.alert_policy !== "off" && (
          <label className="field">
            {zh ? "结构规则范围" : "Structural rule catalogues"}
            <select
              value={options.alert_catalogue}
              onChange={(event) =>
                onChange({
                  alert_catalogue: event.target
                    .value as ScreenOptions["alert_catalogue"],
                })
              }
            >
              <option value="pains_brenk">
                {zh ? "PAINS + Brenk（推荐）" : "PAINS + Brenk (recommended)"}
              </option>
              <option value="pains">PAINS</option>
            </select>
          </label>
        )}
        {options.mode === "scaffold" && (
          <label className="field">
            {zh ? "精确设置每组数量" : "Exact representatives per family"}
            <input
              type="number"
              min={1}
              max={10}
              value={options.per_scaffold}
              onChange={(event) =>
                onChange({ per_scaffold: Number(event.target.value) })
              }
            />
          </label>
        )}
        <label className="field">
          {zh ? "精确保留数量" : "Exact selected count"}
          <input
            type="number"
            min={1}
            max={100}
            value={options.max_selected}
            onChange={(e) => onChange({ max_selected: Number(e.target.value) })}
          />
        </label>
        {options.mode === "similarity" && (
          <label className="field">
            {zh ? "精确相似度阈值" : "Exact similarity threshold"}
            <input
              type="number"
              step="any"
              min={0}
              max={1}
              value={options.minimum_similarity}
              onChange={(e) =>
                onChange({ minimum_similarity: Number(e.target.value) })
              }
            />
          </label>
        )}
        {options.mode === "diversity" && (
          <label className="field">
            {zh ? "可复现随机种子" : "Reproducible random seed"}
            <input
              type="number"
              min={1}
              max={2147483647}
              value={options.seed}
              onChange={(e) => onChange({ seed: Number(e.target.value) })}
            />
          </label>
        )}
        <label className="field">
          {zh ? "名称（可选）" : "Name (optional)"}
          <input
            maxLength={80}
            value={name}
            onChange={(e) => onName(e.target.value)}
          />
        </label>
      </details>
    </>
  );
}
