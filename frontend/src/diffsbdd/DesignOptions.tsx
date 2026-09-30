import { JsonEditor } from "../operations/ScientificInputs";
import { Hint } from "../guided/Hint";
import type { Language } from "../types";
import type { DesignMode } from "./types";
import { compatibleModels, optionsFor } from "./model";
import { optionSchema } from "./generated";
export function DesignOptions({
  mode,
  value,
  onChange,
  expert,
  language,
}: {
  mode: DesignMode;
  value: Record<string, unknown>;
  onChange(v: Record<string, unknown>): void;
  expert: boolean;
  language: Language;
}) {
  const zh = language === "zh";
  return (
    <section>
      <label className="field">
        {zh ? "这次生成多少候选？" : "How many candidates?"}
        <select
          value={Number(value.count)}
          onChange={(e) =>
            onChange({ ...value, count: Number(e.target.value) })
          }
        >
          {[1, 3, 10, 20, 50, 100].map((n) => (
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
                ? "全部原生参数（服务器逐项校验）"
                : "All native parameters (validated by server)"
            }
            value={value}
            onChange={onChange}
          />
          <details>
            <summary>
              {zh
                ? "参数定义、范围与默认值"
                : "Parameter definitions, bounds and defaults"}
            </summary>
            <pre>{JSON.stringify(optionSchema, null, 2)}</pre>
          </details>
        </>
      )}
      <button type="button" onClick={() => onChange(optionsFor(mode))}>
        {zh ? "恢复推荐参数" : "Restore recommended parameters"}
      </button>
    </section>
  );
}
