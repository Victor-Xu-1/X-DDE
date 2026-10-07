import { ChoiceCards } from "../guided/ChoiceCards";
import { Hint } from "../guided/Hint";
import { mechanismLabels, partnerRoles, type TernaryPayload } from "./types";
import type { Language } from "../types";
export function ProximityPlan({
  payload,
  setPayload,
  language,
}: {
  payload: TernaryPayload;
  setPayload(value: TernaryPayload): void;
  language: Language;
}) {
  const zh = language === "zh",
    roles = partnerRoles(payload.mechanism, zh);
  return (
    <>
      <ChoiceCards<"3" | "10" | "20">
        label={zh ? "探索多少个装配？" : "How many assemblies?"}
        value={String(payload.samples) as "3" | "10" | "20"}
        onChange={(samples) =>
          setPayload({
            ...payload,
            samples: Number(samples) as 3 | 10 | 20,
            attempt_budget: Math.min(60, Number(samples) * 4),
          })
        }
        options={[
          {
            value: "3",
            title: zh ? "初步探索 · 推荐" : "Initial exploration · recommended",
            note: zh
              ? "3 个装配，先查看几何与两端保持情况。"
              : "3 assemblies to inspect geometry and arm retention.",
          },
          {
            value: "10",
            title: zh ? "更多比较" : "Broader comparison",
            note: zh
              ? "10 个装配，比较不同空间排列。"
              : "10 assemblies to compare alternative arrangements.",
          },
          {
            value: "20",
            title: zh ? "扩展探索" : "Extended exploration",
            note: zh
              ? "20 个装配，需要更多计算资源。"
              : "20 assemblies; requires more compute.",
          },
        ]}
      />
      <dl className="questionnaire-review">
        <dt>{zh ? "研究类型" : "Mechanism"}</dt>
        <dd>{mechanismLabels[payload.mechanism][zh ? 0 : 1]}</dd>
        <dt>{roles[0]}</dt>
        <dd>
          {payload.partner_a_name} · {payload.partner_a_chain}
        </dd>
        <dt>{roles[1]}</dt>
        <dd>
          {payload.partner_b_name} · {payload.partner_b_chain}
        </dd>
        <dt>{zh ? "结构检查" : "Structural assessment"}</dt>
        <dd>
          {zh
            ? "成键、立体化学、碰撞及两端接触"
            : "Bonds, stereochemistry, clashes and both partner contacts"}
        </dd>
      </dl>
      <details className="proximity-expert">
        <summary>{zh ? "专家微调" : "Expert settings"}</summary>
        <div className="inline-fields">
          <label>
            {zh ? "最多尝试" : "Maximum attempts"}
            <input
              type="number"
              min={payload.samples}
              max={Math.min(60, payload.samples * 4)}
              value={payload.attempt_budget}
              onChange={(e) =>
                setPayload({
                  ...payload,
                  attempt_budget: Number(e.target.value),
                })
              }
            />
          </label>
          <label>
            {zh ? "计算时限（秒）" : "Time limit (seconds)"}
            <input
              type="number"
              min={60}
              max={1800}
              value={payload.wall_seconds}
              onChange={(e) =>
                setPayload({ ...payload, wall_seconds: Number(e.target.value) })
              }
            />
          </label>
          <label>
            <input
              type="checkbox"
              checked={payload.ligand_correction}
              onChange={(e) =>
                setPayload({ ...payload, ligand_correction: e.target.checked })
              }
            />
            {zh ? "原生分子几何校正" : "Native molecular geometry correction"}
          </label>
        </div>
      </details>
      <p className="proximity-caption">
        {zh
          ? "未通过基本几何检查的装配保留供诊断，不作为可复用候选。"
          : "Assemblies failing basic geometry checks remain diagnostic and cannot be reused as qualified candidates."}
        <Hint
          label={
            zh ? "这些结果可以证明什么？" : "What do the results establish?"
          }
        >
          {zh
            ? "结果用于比较空间假设。未计算三元结合自由能、协同性或细胞效应；基本几何通过也不代表药效成立。"
            : "Results compare spatial hypotheses. Ternary binding free energy, cooperativity and cellular effects are not calculated; passing basic geometry does not establish activity."}
        </Hint>
      </p>
    </>
  );
}
