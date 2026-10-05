import { Hint } from "../guided/Hint";
import { ExpertChoices } from "./ExpertChoices";
import type { Language } from "../types";
import type {
  ScientificPayload,
  ScientificProgram,
  ScientificTask,
} from "./types";

export function ScientificChoices({
  program,
  language,
  payload,
  onChange,
  options,
  onOptions,
  expert,
  onExpert,
}: {
  program: ScientificProgram;
  language: Language;
  payload: ScientificPayload;
  onChange(value: Partial<ScientificPayload>): void;
  options: ScientificTask["options"];
  onOptions(value: ScientificTask["options"]): void;
  expert: boolean;
  onExpert(value: boolean): void;
}) {
  const zh = language === "zh";
  const countField =
    program === "boltz"
      ? "samples"
      : ["reinvent", "ligandmpnn", "boltzgen"].includes(program)
        ? "candidates"
        : null;
  const choices =
    program === "boltz"
      ? [1, 3, 5]
      : program === "ligandmpnn"
        ? [8, 20, 50]
        : [20, 50, 100];
  return (
    <>
      {countField && (
        <fieldset className="choice-grid">
          <legend>
            {zh
              ? "希望查看多少个候选？"
              : "How many candidates would you like?"}
          </legend>
          {choices.map((value) => (
            <label className="choice-card" key={value}>
              <input
                type="radio"
                name="candidate-count"
                checked={payload[countField] === value}
                onChange={() => onChange({ [countField]: value })}
              />
              {value} {zh ? "个" : "candidates"}
            </label>
          ))}
        </fieldset>
      )}
      {program === "boltzgen" && (
        <>
          <label className="field">
            {zh ? "保留候选" : "Retain candidates"}
            <select
              value={Number(payload.retain)}
              onChange={(e) => onChange({ retain: Number(e.target.value) })}
            >
              {[5, 10, 20].map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
          </label>
        </>
      )}
      {program === "apbs" && (
        <div className="inline-fields">
          <label className="field">
            pH
            <select
              value={Number(payload.ph)}
              onChange={(e) => onChange({ ph: Number(e.target.value) })}
            >
              {[6, 7, 7.4, 8].map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            {zh ? "盐浓度" : "Salt concentration"}
            <select
              value={Number(payload.salt_molar)}
              onChange={(e) => onChange({ salt_molar: Number(e.target.value) })}
            >
              <option value={0}>0 mM</option>
              <option value={0.05}>50 mM</option>
              <option value={0.15}>150 mM</option>
              <option value={0.3}>300 mM</option>
            </select>
          </label>
        </div>
      )}
      {program === "openmm" && (
        <label className="field">
          {zh ? "优化程度" : "Refinement budget"}
          <select
            value={Number(payload.iterations)}
            onChange={(e) => onChange({ iterations: Number(e.target.value) })}
          >
            <option value={250}>{zh ? "快速检查" : "Quick check"}</option>
            <option value={500}>
              {zh ? "标准优化（推荐）" : "Standard (recommended)"}
            </option>
            <option value={2000}>
              {zh ? "更充分优化" : "Extended refinement"}
            </option>
          </select>
        </label>
      )}
      {program === "ligandmpnn" && (
        <label className="checkbox-label">
          <input
            type="checkbox"
            checked={Boolean(payload.pack_sidechains)}
            onChange={(e) => onChange({ pack_sidechains: e.target.checked })}
          />
          {zh
            ? "同时生成侧链三维结构"
            : "Generate packed side-chain structures"}
        </label>
      )}
      {program === "apbs" && (
        <label className="field">
          {zh ? "电势网格精度" : "Potential-grid detail"}
          <select
            value={Number(payload.grid)}
            onChange={(e) => onChange({ grid: Number(e.target.value) })}
          >
            <option value={65}>{zh ? "快速" : "Quick"}</option>
            <option value={97}>{zh ? "标准" : "Standard"}</option>
            <option value={129}>{zh ? "精细" : "Fine"}</option>
          </select>
        </label>
      )}
      <button
        type="button"
        className="text-button"
        aria-expanded={expert}
        onClick={() => onExpert(!expert)}
      >
        {zh ? "专家微调" : "Expert tuning"}
      </button>
      {expert && (
        <div className="expert-fields">
          <ExpertChoices
            program={program}
            payload={payload}
            language={language}
            onChange={onChange}
          />
          <label className="field">
            {zh ? "CPU 核数" : "CPU cores"}
            <input
              type="number"
              min={1}
              max={16}
              value={options.cpu}
              onChange={(e) =>
                onOptions({ ...options, cpu: Number(e.target.value) })
              }
            />
          </label>
          <label className="field">
            {zh ? "内存上限（MiB）" : "Memory budget (MiB)"}
            <input
              type="number"
              min={1024}
              max={65536}
              step={1024}
              value={options.memory_mib}
              onChange={(e) =>
                onOptions({ ...options, memory_mib: Number(e.target.value) })
              }
            />
          </label>
          {program !== "boltzgen" && (
            <label className="field">
              {zh ? "随机种子" : "Random seed"}
              <Hint label={zh ? "随机种子说明" : "Random seed help"}>
                {zh
                  ? "可控制的随机步骤使用此数值；不同软件的结果不能保证完全相同。"
                  : "Controls supported random steps; results are not identical across different software."}
              </Hint>
              <input
                type="number"
                min={0}
                max={2147483647}
                value={options.seed}
                onChange={(e) =>
                  onOptions({ ...options, seed: Number(e.target.value) })
                }
              />
            </label>
          )}
        </div>
      )}
    </>
  );
}
