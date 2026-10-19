import { JsonEditor } from "../operations/ScientificInputs";
import { Hint } from "../guided/Hint";
import type { Language } from "../types";
import type { DesignMode } from "./types";
import {
  compatibleModels,
  editableOptionNames,
  editableOptions,
  inpaintSizeValid,
  optionsFor,
} from "./model";
import { OptimizationBudget } from "./OptimizationBudget";
export function DesignOptions({
  mode,
  value,
  onChange,
  expert,
  language,
  fixedCount = 0,
}: {
  mode: DesignMode;
  value: Record<string, unknown>;
  onChange(v: Record<string, unknown>): void;
  expert: boolean;
  language: Language;
  fixedCount?: number;
}) {
  const zh = language === "zh";
  return (
    <section>
      {mode !== "optimize" && (
        <>
          <label className="field">
            {zh ? "这次生成多少候选？" : "How many candidates?"}
            <select
              value={Number(value.count)}
              onChange={(e) =>
                onChange({ ...value, count: Number(e.target.value) })
              }
            >
              {[...new Set([Number(value.count), 1, 3, 10, 20, 50, 100])]
                .filter((n) => Number.isInteger(n) && n >= 1 && n <= 100)
                .sort((a, b) => a - b)
                .map((n) => (
                  <option key={n} value={n}>
                    {n}
                    {zh ? " 个" : " candidates"}
                  </option>
                ))}
            </select>
          </label>
          <Hint label={zh ? "候选数量说明" : "Candidate count help"}>
            {zh
              ? "候选越多，计算与后续筛选的开销越大。优化模式按种群数量 × 轮次计算尝试预算。"
              : "More candidates increase compute and review costs. Optimization attempts are population × rounds."}
          </Hint>
        </>
      )}
      {mode === "optimize" && (
        <OptimizationBudget
          value={value}
          onChange={onChange}
          language={language}
        />
      )}
      <label className="field">
        {zh ? "使用哪个模型？" : "Which model?"}
        <select
          value={String(value.model)}
          onChange={(e) => onChange({ ...value, model: e.target.value })}
        >
          {compatibleModels(mode).map((m) => (
            <option key={m.id} value={m.id}>
              {`${m.representation === "fullatom" ? (zh ? "全原子" : "Full atom") : "Cα"} · ${m.dataset} · ${m.strategy === "cond" ? (zh ? "条件生成" : "Conditional") : zh ? "联合生成" : "Joint"}`}
            </option>
          ))}
        </select>
      </label>
      <p className="field-help">
        {zh
          ? "默认使用全原子条件模型。CA 表示仅用 Cα 受体表示；joint 模型仅供从头生成。安装状态由服务器确认。"
          : "The default uses full-atom conditioning. CA uses a Cα receptor representation; joint models support generation only. The server verifies installation."}
      </p>
      {mode === "inpaint" && value.size_mode === "fixed" && (
        <>
          <label className="field">
            {zh
              ? "在固定核心外新增多少个重原子？"
              : "How many heavy atoms should be added to the fixed core?"}
            <input
              type="number"
              min={Math.max(0, 8 - fixedCount)}
              max={Math.min(79, 80 - fixedCount)}
              step={1}
              required
              value={Number(value.added_atoms)}
              aria-invalid={!inpaintSizeValid(value, fixedCount)}
              onChange={(event) =>
                onChange({ ...value, added_atoms: Number(event.target.value) })
              }
            />
          </label>
          <p
            className={
              inpaintSizeValid(value, fixedCount) ? "field-help" : "notice"
            }
            role={inpaintSizeValid(value, fixedCount) ? undefined : "alert"}
          >
            {zh
              ? `固定 ${fixedCount} ＋ 新增 ${value.added_atoms} ＝ ${fixedCount + Number(value.added_atoms)} 个重原子；合计需为 8–80。`
              : `${fixedCount} fixed + ${value.added_atoms} added = ${fixedCount + Number(value.added_atoms)} heavy atoms; the total must be 8–80.`}
          </p>
        </>
      )}
      {mode === "inpaint" && (
        <label className="field">
          {zh ? "新片段可以连接在哪里？" : "Where may the new fragment attach?"}
          <select
            value={String(value.attachment_policy ?? "any_core_atom")}
            onChange={(event) =>
              onChange({
                ...value,
                attachment_policy: event.target.value,
                ...(event.target.value === "original_cuts"
                  ? { preserve_bonds: true }
                  : {}),
              })
            }
          >
            <option value="original_cuts">
              {zh
                ? "仅原有断点 · 推荐"
                : "Original cut sites only · Recommended"}
            </option>
            <option value="any_core_atom">
              {zh
                ? "允许在核心其他位置生长"
                : "Allow growth at other core positions"}
            </option>
          </select>
        </label>
      )}
      {mode === "optimize" && (
        <label className="field">
          {zh
            ? "想优先改善哪个描述符？"
            : "Which descriptor should be optimized?"}
          <select
            value={String(value.objective)}
            onChange={(e) => onChange({ ...value, objective: e.target.value })}
          >
            <option value="qed">
              {zh ? "QED 类药性" : "QED drug-likeness"}
            </option>
            <option value="sa">
              {zh
                ? "SA 合成可及性启发式指标"
                : "SA synthetic-accessibility heuristic"}
            </option>
          </select>
        </label>
      )}
      {expert && (
        <>
          <JsonEditor
            label={
              zh
                ? "当前模式与模型的原生参数"
                : "Native settings for this mode and model"
            }
            value={editableOptions(mode, value)}
            onChange={(changes) => {
              const next = { ...value, ...changes };
              const allowed = editableOptionNames(mode, next);
              const previous = editableOptionNames(mode, value);
              const unsupported = Object.keys(changes).filter(
                (name) =>
                  !allowed.has(name) &&
                  !(
                    previous.has(name) && Object.is(changes[name], value[name])
                  ),
              );
              if (unsupported.length)
                throw new Error(
                  (zh
                    ? "当前模式或模型不使用这些参数："
                    : "These controls are not used by this mode or model: ") +
                    unsupported.join(", "),
                );
              onChange(next);
            }}
          />
        </>
      )}
      <button type="button" onClick={() => onChange(optionsFor(mode))}>
        {zh ? "恢复推荐参数" : "Restore recommended parameters"}
      </button>
    </section>
  );
}
