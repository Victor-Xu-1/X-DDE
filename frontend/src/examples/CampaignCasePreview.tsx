import { useState } from "react";
import type { Language } from "../types";
import { useExample } from "./context";
import { SequenceTrack } from "../presentation/SequenceTrack";
import { ResearchTabs } from "../presentation/ResearchTabs";
import { StructureViewer } from "../viewer/StructureViewer";
import { Hint } from "../guided/Hint";
import {
  campaignMaterials,
  campaignReference,
  mutableRegions,
} from "./campaign-preview-model";
import "./campaign-preview.css";

export function CampaignCasePreview({ language }: { language: Language }) {
  const example = useExample(),
    zh = language === "zh";
  const [selected, setSelected] = useState<string | null>(null);
  const draft = example?.campaign_draft;
  if (example?.record?.kind !== "campaign" || !draft) return null;
  const materials = campaignMaterials(draft);
  const current = materials.find((row) => row.key === selected) ?? materials[0];
  if (!current) return null;
  const regions = mutableRegions(current.sequence, current.positions);
  const reference = campaignReference(example, current.source);
  const label = (row: typeof current) =>
    (row.role === "target"
      ? zh
        ? "靶标"
        : "Target"
      : zh
        ? "抗体可变域"
        : "Antibody variable domain") +
    (zh ? " · 输入链 " : " · Input chain ") +
    row.chain;
  const sequence = (
    <>
      <SequenceTrack
        key={current.key + current.sequence}
        sequence={current.sequence}
        language={language}
        label={label(current)}
        regions={regions ?? []}
      />
      {regions === null && (
        <p role="alert" className="field-help">
          {zh
            ? "可调整位置未与当前序列对应，请检查原始输入。"
            : "Mutable positions do not match this sequence; check the original input."}
        </p>
      )}
    </>
  );
  const views = [
    {
      id: "sequence",
      label: zh ? "序列与 CDR" : "Sequence and CDR",
      content: sequence,
    },
  ];
  if (reference)
    views.unshift({
      id: "reference",
      label: zh ? "参考结构" : "Reference structure",
      content: (
        <>
          <StructureViewer
            language={language}
            urls={["/api/assets/" + reference.asset_id]}
            initialMode="cartoon"
            ligandContext={false}
          />
        </>
      ),
    });
  return (
    <section
      className="campaign-case-preview"
      aria-label={zh ? "已验证的设计示例" : "Validated design example"}
    >
      <p className="field-help campaign-template-state">
        {zh ? "输入模板 · 设计尚未运行" : "Input template · Design has not run"}
      </p>
      <div className="campaign-material-layout">
        <section aria-label={zh ? "设计输入材料" : "Design input materials"}>
          <h3>{zh ? "准备好的研究材料" : "Prepared research materials"}</h3>
          <div className="table-scroll">
            <table aria-label={zh ? "研究材料" : "Research materials"}>
              <thead>
                <tr>
                  <th>{zh ? "研究材料" : "Material"}</th>
                  <th>{zh ? "长度" : "Length"}</th>
                  <th>{zh ? "可调整位置" : "Mutable positions"}</th>
                </tr>
              </thead>
              <tbody>
                {materials.map((row) => (
                  <tr
                    key={row.key}
                    data-selected={row.key === current.key || undefined}
                  >
                    <th scope="row">
                      <button
                        className="campaign-material-choice"
                        type="button"
                        aria-pressed={row.key === current.key}
                        onClick={() => setSelected(row.key)}
                      >
                        {label(row)}
                      </button>
                    </th>
                    <td>{row.sequence.length} aa</td>
                    <td>
                      {row.role === "target"
                        ? "—"
                        : row.positions.length + " CDR"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Hint
            label={
              zh
                ? "参考结构与输入链说明"
                : "Reference structure and input chain help"
            }
          >
            {zh
              ? "输入链名用于新设计，与参考结构的链号不一定相同。公开参考结构保留原始结合伙伴；这里没有新的抗体复合物预测，也没有对齐或修改坐标。CDR 标注来自输入序列的位置。"
              : "Input chain names belong to the new design and may differ from reference chains. Public references retain their original partners; these are not new antibody predictions or aligned/modified coordinates. CDR marks use the input sequence positions."}
          </Hint>
        </section>
        <section
          className="campaign-material-inspector"
          aria-label={zh ? "输入材料预览" : "Input material preview"}
        >
          <ResearchTabs
            key={current.key}
            label={zh ? "材料视图" : "Material views"}
            tabs={views}
          />
        </section>
      </div>
      <p className="field-help">
        {zh
          ? "配置对话模型后，加载此模板，按步骤确认并提交新的设计任务。"
          : "Configure a language model, load this template, review the steps and submit a new design task."}
      </p>
    </section>
  );
}
