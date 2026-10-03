import { useState } from "react";
import { artifactUrl } from "../api";
import { defaults } from "../form-model";
import { Hint } from "../guided/Hint";
import type { MoleculeRef } from "../research/types";
import type { Job, Language, Prediction } from "../types";
import { HumanizationForm } from "./HumanizationForm";
import { SequenceComparison } from "./SequenceComparison";
import type { HumanizationResult } from "./types";
import "./humanization.css";

const reasons: Record<string, [string, string]> = {
  unsupported_variable_region_input: [
    "请提供 70–200 个标准氨基酸组成的完整可变域。",
    "Provide a complete variable region of 70–200 standard amino acids.",
  ],
  prepare_an_exact_variable_region_first: [
    "输入包含可变域之外的序列；请先用抗体编号模块提取可变域。",
    "The input extends beyond the variable region; extract it with antibody numbering first.",
  ],
  vhh_requires_a_heavy_chain_domain: [
    "VHH 探索性评估只接受重链型可变域。",
    "Exploratory VHH evaluation accepts heavy-chain variable regions only.",
  ],
};

export function HumanizationResults({
  job,
  result,
  language,
  onDraft,
  onCreated,
}: {
  job: Job;
  result: HumanizationResult;
  language: Language;
  onDraft?(draft: Prediction): void;
  onCreated?(job: Job): void;
}) {
  const zh = language === "zh",
    [index, setIndex] = useState(0),
    [reuse, setReuse] = useState<MoleculeRef | null>(null),
    row = result.rows[index];
  return (
    <div className="discovery-results humanization-results">
      <label className="field">
        {zh ? "查看哪条序列？" : "Which sequence?"}
        <select
          value={index}
          onChange={(e) => {
            setIndex(Number(e.target.value));
            setReuse(null);
          }}
        >
          {result.rows.map((value, i) => (
            <option value={i} key={value.source_id}>
              {value.source_id} ·{" "}
              {value.status === "failed"
                ? zh
                  ? "未能评估"
                  : "Not evaluated"
                : value.proposal
                  ? zh
                    ? "有框架建议"
                    : "Framework proposed"
                  : zh
                    ? "已评估"
                    : "Evaluated"}
            </option>
          ))}
        </select>
      </label>
      {row?.status === "evaluated" ? (
        <>
          <SequenceComparison row={row} language={language} />
          {result.vhh_scope === "human_heavy_reference_exploration_only" && (
            <p role="status">
              {zh
                ? "VHH 仅作人类重链参考探索，不建立 VHH 专用人源程度或可开发性结论。"
                : "VHH is exploratory against a human heavy-chain reference; VHH-specific humanness or developability is not established."}
            </p>
          )}
          {!row.proposal && (
            <p role="status">
              {result.options.mode === "evaluate"
                ? zh
                  ? "本次只评估，未修改原始序列。"
                  : "This task evaluated the unchanged source."
                : zh
                  ? "在本次保护规则和预算内，没有生成不同的候选序列。"
                  : "No different candidate was produced within the selected protections and budget."}
            </p>
          )}
          <div className="humanization-actions">
            {row.artifact && (
              <a href={artifactUrl(job.id, row.artifact)} download>
                {zh ? "下载修改建议 FASTA" : "Download proposed FASTA"}
              </a>
            )}
            {row.reference && row.proposal && onDraft && (
              <button
                type="button"
                className="secondary-button"
                onClick={() =>
                  onDraft({
                    name: (row.source_id + " framework proposal").slice(0, 80),
                    components: [
                      {
                        kind: "protein",
                        value: row.proposal!,
                        count: 1,
                        source_sequence: row.reference!.asset_id,
                      },
                    ],
                    scientific_inputs: [row.reference!],
                    parameters: { ...defaults },
                  })
                }
              >
                {zh ? "用这个候选预测结构" : "Predict this candidate structure"}
              </button>
            )}
            {row.reference && onCreated && (
              <button
                type="button"
                className="secondary-button"
                onClick={() => setReuse(row.reference!)}
              >
                {zh ? "再次评估这个候选" : "Evaluate this candidate again"}
              </button>
            )}
          </div>
          {row.artifact && !row.reference && (
            <p role="status">
              {zh
                ? "候选已生成，但资产登记尚未完成；请在任务页检查资产登记状态后刷新结果。"
                : "The candidate is generated but asset registration is incomplete; check indexing on the task page and refresh results."}
            </p>
          )}
          <Hint
            label={zh ? "下一步怎么验证？" : "What should be checked next?"}
          >
            {zh
              ? "候选需要结构和结合实验验证；保留 CDR 并不保证亲和力保持。这里没有预测临床免疫原性，也没有评估重轻链配对。"
              : "Validate candidate structures and binding experimentally. Preserved CDRs do not establish retained affinity. Clinical immunogenicity and paired-chain compatibility are not evaluated here."}
          </Hint>
        </>
      ) : (
        <p role="status">
          {row?.reason && reasons[row.reason]
            ? reasons[row.reason][zh ? 0 : 1]
            : zh
              ? "此序列未能完成参考评估，请检查可变域输入。完整结果中保留了失败原因。"
              : "The native model could not evaluate this sequence; check the variable-region input. The reason is retained in the full result."}
        </p>
      )}
      {onCreated && (
        <button
          type="button"
          className="secondary-button"
          onClick={() => setReuse(result.source)}
        >
          {zh
            ? "复用原始输入重新设置"
            : "Reuse the original input with new settings"}
        </button>
      )}
      <details>
        <summary>
          {zh ? "评估方法与参考" : "Evaluation method and reference"}
        </summary>
        <p>Sapiens · ANARCII · Promb</p>
        <p>
          {zh
            ? "固定 OAS 人类参考：精确 9 肽匹配，参考肽段在至少 10% 人类受试者中出现。"
            : "Fixed human OAS reference: exact 9-mer identity; reference peptides observed in at least 10% of human subjects."}
        </p>
        {row?.reason && <p>{row.reason}</p>}
      </details>
      {reuse && onCreated && (
        <section aria-label={zh ? "候选复用" : "Candidate reuse"}>
          <button
            type="button"
            className="secondary-button"
            onClick={() => setReuse(null)}
          >
            {zh ? "关闭候选复用" : "Close candidate reuse"}
          </button>
          <HumanizationForm
            key={reuse.version_id ?? reuse.asset_id}
            language={language}
            onCreated={onCreated}
            initialSequence={reuse}
          />
        </section>
      )}
    </div>
  );
}
