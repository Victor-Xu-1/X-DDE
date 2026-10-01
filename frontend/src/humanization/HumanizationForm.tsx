import { useState } from "react";
import { SequencePicker } from "../research/SequencePicker";
import type { MoleculeRef } from "../research/types";
import { ChoiceCards } from "../guided/ChoiceCards";
import { Hint } from "../guided/Hint";
import { Questionnaire } from "../guided/Questionnaire";
import { useTaskReadiness } from "../guided/useTaskReadiness";
import { useTaskSubmit } from "../operations/useTaskSubmit";
import type { Job, Language } from "../types";
import { HumanizationSettings } from "./Settings";
import {
  humanizationDefaults,
  humanizationMaxRecords,
  humanizationVersions,
} from "./generated";
import type { HumanizationOptions } from "./types";

export function HumanizationForm({
  language,
  onCreated,
  initialSequence,
}: {
  language: Language;
  onCreated(job: Job): void;
  initialSequence?: MoleculeRef;
}) {
  const zh = language === "zh",
    run = useTaskSubmit(onCreated),
    availability = useTaskReadiness("antibody.humanize");
  const [source, setSource] = useState<MoleculeRef | null>(
      initialSequence ?? null,
    ),
    [options, setOptions] = useState<HumanizationOptions>({
      ...humanizationDefaults,
    }),
    [name, setName] = useState("");
  const validOptions =
    Number.isInteger(options.max_mutations) &&
    (options.mode === "evaluate"
      ? options.max_mutations === 0 && options.iterations === 1
      : options.format === "conventional" &&
        options.max_mutations >= 1 &&
        options.max_mutations <= 20 &&
        [1, 2, 3, 4].includes(options.iterations)) &&
    [1, 2].includes(options.cpu) &&
    [2048, 4096, 8192].includes(options.memory_mib);
  return (
    <Questionnaire
      language={language}
      ready={availability.ready}
      busy={run.busy}
      error={run.error || availability.error}
      unavailable={
        zh
          ? "请在安装与组件中部署 Sapiens 抗体环境。"
          : "Install the Sapiens antibody environment in Installation & components."
      }
      submitLabel={
        options.mode === "evaluate"
          ? zh
            ? "开始序列评估"
            : "Evaluate sequences"
          : zh
            ? "生成框架建议"
            : "Generate framework proposals"
      }
      onSubmit={() =>
        run.submit({
          operation: "antibody_humanize",
          sequences: source!,
          scientific_inputs: [source!],
          options,
          name:
            name.trim() ||
            (zh
              ? "抗体人源参考与框架评估"
              : "Antibody reference and framework evaluation"),
        })
      }
      steps={[
        {
          title: zh ? "提供可变域序列" : "Provide variable regions",
          valid: Boolean(source),
          content: (
            <>
              <SequencePicker
                language={language}
                label={
                  zh ? "抗体可变域序列" : "Antibody variable-region sequences"
                }
                value={source}
                onChange={setSource}
                filename="variable-regions.fasta"
              />
              <Hint
                label={
                  zh ? "什么序列可以使用？" : "Which sequences can be used?"
                }
              >
                {zh
                  ? `每个 FASTA 记录放一条完整的 VH、VL 或 VHH 可变域，70–200 个标准氨基酸，最多 ${humanizationMaxRecords} 条。完整抗体链或 scFv 请先用抗体编号模块提取可变域；不自动裁切输入。`
                  : `Use one complete VH, VL or VHH variable region per FASTA record: 70–200 standard amino acids, at most ${humanizationMaxRecords} records. Extract variable regions from full chains or scFv with antibody numbering first; inputs are not silently cropped.`}
              </Hint>
            </>
          ),
        },
        {
          title: zh ? "选择抗体形式" : "Choose antibody format",
          valid: true,
          content: (
            <ChoiceCards<HumanizationOptions["format"]>
              label={
                zh
                  ? "这些序列属于哪类抗体？"
                  : "Which antibody format is represented?"
              }
              value={options.format}
              onChange={(format) =>
                setOptions((value) => ({
                  ...value,
                  format,
                  ...(format === "vhh_exploratory"
                    ? { mode: "evaluate", max_mutations: 0, iterations: 1 }
                    : {}),
                }))
              }
              options={[
                {
                  value: "conventional",
                  title: zh ? "常规抗体 VH / VL" : "Conventional VH / VL",
                  note: zh
                    ? "可评估，也可生成保留 CDR 的框架建议。"
                    : "Evaluate or propose protected framework changes.",
                },
                {
                  value: "vhh_exploratory",
                  title: zh
                    ? "VHH（探索性评估）"
                    : "VHH (exploratory evaluation)",
                  note: zh
                    ? "仅与人类重链参考比较，不生成修改建议。"
                    : "Compare with the human heavy-chain reference; no mutation proposals.",
                },
              ]}
            />
          ),
        },
        {
          title: zh ? "选择研究方式" : "Choose the research approach",
          valid: validOptions,
          content: (
            <HumanizationSettings
              language={language}
              options={options}
              onChange={setOptions}
              name={name}
              onName={setName}
            />
          ),
        },
        {
          title: zh ? "确认递交" : "Review submission",
          valid: Boolean(source) && validOptions,
          content: (
            <>
              <dl className="questionnaire-review">
                <dt>{zh ? "序列版本" : "Sequence version"}</dt>
                <dd>{source?.version_id ?? source?.asset_id}</dd>
                <dt>{zh ? "研究方式" : "Approach"}</dt>
                <dd>
                  {options.mode === "evaluate"
                    ? zh
                      ? "只评估，不修改"
                      : "Evaluate unchanged sequences"
                    : zh
                      ? `最多修改 ${options.max_mutations} 处，${options.iterations} 轮`
                      : `At most ${options.max_mutations} positions, ${options.iterations} rounds`}
                </dd>
                <dt>{zh ? "抗体形式" : "Antibody format"}</dt>
                <dd>
                  {options.format === "conventional"
                    ? "VH / VL"
                    : zh
                      ? "VHH · 探索性"
                      : "VHH · exploratory"}
                </dd>
                <dt>{zh ? "原生模型" : "Native models"}</dt>
                <dd>
                  Sapiens {humanizationVersions.sapiens} · ANARCII{" "}
                  {humanizationVersions.anarcii}
                </dd>
                <dt>{zh ? "保护区域" : "Protected regions"}</dt>
                <dd>
                  {zh
                    ? "全部 IMGT CDR 和原有半胱氨酸"
                    : "All IMGT CDRs and original cysteines"}
                </dd>
                <dt>{zh ? "原始序列" : "Original sequences"}</dt>
                <dd>
                  {zh
                    ? "保持原样；修改建议保存为新版本"
                    : "Unchanged; changed proposals become new versions"}
                </dd>
              </dl>
              <Hint
                label={
                  zh
                    ? "候选能直接用于实验吗？"
                    : "Are candidates experimentally validated?"
                }
              >
                {zh
                  ? "候选还需要结构、结合和实验验证。结果会保留模型、参考数据、每轮修改和失败原因；不会把预测包装为实测的免疫原性。"
                  : "Candidates still require structure, binding and experimental evaluation. Models, reference identities, each proposal round and failure reasons are retained; clinical immunogenicity is not predicted."}
              </Hint>
            </>
          ),
        },
      ]}
    />
  );
}
