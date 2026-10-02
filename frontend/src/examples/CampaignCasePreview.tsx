import type { Language } from "../types";
import { useExample } from "./context";

export function CampaignCasePreview({ language }: { language: Language }) {
  const example = useExample(),
    zh = language === "zh";
  const draft = example?.campaign_draft;
  if (example?.record?.kind !== "campaign" || !draft) return null;
  return (
    <section aria-label={zh ? "已验证的设计示例" : "Validated design example"}>
      <h2>
        {zh
          ? "示例输入已通过原生校验"
          : "Example inputs passed native validation"}
      </h2>
      <table className="result-table">
        <thead>
          <tr>
            <th>{zh ? "研究材料" : "Research material"}</th>
            <th>{zh ? "长度" : "Length"}</th>
            <th>{zh ? "可调整区域" : "Mutable regions"}</th>
          </tr>
        </thead>
        <tbody>
          {Object.entries(draft.targets).map(([chain, sequence]) => (
            <tr key={chain}>
              <td>HER2 · 6LBX · {chain}</td>
              <td>{sequence.length} aa</td>
              <td>—</td>
            </tr>
          ))}
          {Object.entries(draft.binders).map(([chain, sequence]) => (
            <tr key={chain}>
              <td>
                {zh ? "曲妥珠单抗可变域" : "Trastuzumab variable domain"} ·{" "}
                {chain}
              </td>
              <td>{sequence.length} aa</td>
              <td>
                {draft.cdr[chain].length} {zh ? "个 CDR 位置" : "CDR positions"}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="notice">
        {zh
          ? "此处展示已校验的真实材料和配置。代理设计尚未运行；配置对话模型后，可以加载案例、确认并提交新任务。"
          : "This shows validated real inputs and configuration. Agent design has not run; configure a language model, then load the example, review and submit a new task."}
      </p>
    </section>
  );
}
