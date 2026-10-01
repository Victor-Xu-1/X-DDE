import { ChoiceCards } from "../guided/ChoiceCards";
import { Hint } from "../guided/Hint";
import { ReferencePicker } from "../diffsbdd/ReferencePicker";
import type { Language } from "../types";
import type { MoleculeRef } from "../research/types";
import {
  screenLabels,
  type ScreenMode,
  type ScreenOptions,
} from "./screen-types";

export function ScreenPurpose({
  language,
  mode,
  onMode,
  query,
  onQuery,
}: {
  language: Language;
  mode: ScreenMode;
  onMode(mode: ScreenMode): void;
  query: MoleculeRef | null;
  onQuery(query: MoleculeRef | null): void;
}) {
  const zh = language === "zh",
    requiresQuery = mode === "similarity" || mode === "substructure";
  return (
    <>
      <ChoiceCards<ScreenMode>
        label={zh ? "这次希望找什么？" : "What should this selection do?"}
        value={mode}
        onChange={onMode}
        options={Object.entries(screenLabels).map(([value, label]) => ({
          value: value as ScreenMode,
          title: label[zh ? 0 : 1],
        }))}
      />
      {requiresQuery && (
        <ReferencePicker
          kind="ligand"
          allowedSuffixes={[".sdf"]}
          value={query}
          onChange={onQuery}
          language={language}
          label={zh ? "参照分子或片段" : "Query molecule or fragment"}
        />
      )}
      <Hint label={zh ? "选择的依据是什么？" : "What is selection based on?"}>
        {zh
          ? "相似性采用保留手性的 Morgan 指纹；片段检索匹配所选分子的真实结构；多样性按指纹挑代表。这些不预测药效或结合。"
          : "Similarity uses chiral Morgan fingerprints; substructure matches the selected molecule's actual chemical graph; diversity selects fingerprint representatives. These do not predict activity or binding."}
      </Hint>
    </>
  );
}

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

export function ScreenReview({
  language,
  libraryName,
  query,
  options,
}: {
  language: Language;
  libraryName: string;
  query: MoleculeRef | null;
  options: ScreenOptions;
}) {
  const zh = language === "zh";
  return (
    <>
      <dl className="questionnaire-review">
        <dt>{zh ? "分子库" : "Library"}</dt>
        <dd>{libraryName}</dd>
        <dt>{zh ? "用途" : "Purpose"}</dt>
        <dd>{screenLabels[options.mode][zh ? 0 : 1]}</dd>
        <dt>{zh ? "最多保留" : "Maximum output"}</dt>
        <dd>{options.max_selected}</dd>
        {query && (
          <>
            <dt>{zh ? "参照版本" : "Query version"}</dt>
            <dd>
              {query.version_id ?? query.asset_id} · #{query.record + 1}
            </dd>
          </>
        )}
      </dl>
      <Hint label={zh ? "结果如何复用？" : "How to reuse selected molecules?"}>
        {zh
          ? "选中记录保存为新分子资产，可继续准备构象、计算性质或对接。不会脱盐、枚举状态或推断坐标；盐和多片段会标记。未选中不等于无活性。"
          : "Selected records become new molecular assets for conformer preparation, properties or docking. No salt stripping, state enumeration or coordinate inference; salts/multiple fragments are flagged. Unselected does not mean inactive."}
      </Hint>
    </>
  );
}
