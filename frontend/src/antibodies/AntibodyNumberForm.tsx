import { numberingDefaults } from "./generated";
import { useState } from "react";
import { SequencePicker } from "../research/SequencePicker";
import { Questionnaire } from "../guided/Questionnaire";
import { ChoiceCards } from "../guided/ChoiceCards";
import { Hint } from "../guided/Hint";
import { useTaskReadiness } from "../guided/useTaskReadiness";
import { useTaskSubmit } from "../operations/useTaskSubmit";
import type { Job, Language } from "../types";
import type { MoleculeRef } from "../research/types";
import type { NumberingOptions } from "./types";

export function AntibodyNumberForm({
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
    availability = useTaskReadiness("antibody.number");
  const [source, setSource] = useState<MoleculeRef | null>(
      initialSequence ?? null,
    ),
    [format, setFormat] = useState<"chains" | "scfv">("chains"),
    [mode, setMode] = useState<"accuracy" | "speed">("accuracy"),
    [cpu, setCPU] = useState(1),
    [name, setName] = useState("");
  const options: NumberingOptions = {
    ...numberingDefaults,
    mode,
    scfv: format === "scfv",
    cpu,
  };
  return (
    <Questionnaire
      language={language}
      ready={availability.ready}
      busy={run.busy}
      error={run.error || availability.error}
      unavailable={
        zh
          ? "请在安装与组件中部署 ANARCII 抗体环境；无需 OpenDDE。"
          : "Install the independent ANARCII environment in Installation & components."
      }
      submitLabel={zh ? "开始抗体标注" : "Annotate antibodies"}
      onSubmit={() =>
        run.submit({
          operation: "antibody_number",
          name:
            name.trim() ||
            (zh ? "抗体编号与CDR" : "Antibody numbering and CDRs"),
          sequences: source!,
          scientific_inputs: [source!],
          options,
        })
      }
      steps={[
        {
          title: zh ? "选择抗体序列" : "Choose antibody sequences",
          valid: Boolean(source),
          content: (
            <SequencePicker
              language={language}
              label={zh ? "抗体输入序列" : "Antibody input sequences"}
              value={source}
              onChange={setSource}
              filename="antibody-input.fasta"
            />
          ),
        },
        {
          title: zh ? "选择分子形式" : "Choose format",
          valid: true,
          content: (
            <>
              <ChoiceCards<"chains" | "scfv">
                label={zh ? "输入是什么形式？" : "What is the input format?"}
                value={format}
                onChange={setFormat}
                options={[
                  {
                    value: "chains",
                    title: zh ? "独立抗体链或 VHH" : "Separate chains or VHH",
                    note: zh
                      ? "重链、轻链或 VHH 每条放一个序列记录。"
                      : "One FASTA record per heavy/light/VHH chain.",
                  },
                  {
                    value: "scfv",
                    title: zh ? "串联的 scFv" : "Linked scFv",
                    note: zh
                      ? "在原始序列内识别多个抗体域，保留原始位置。"
                      : "Identify linked antibody domains with original sequence positions.",
                  },
                ]}
              />
              <Hint
                label={
                  zh ? "可以输入哪些序列？" : "Which sequences are supported?"
                }
              >
                {zh
                  ? "每次最多50条，单条20–2000个支持的氨基酸。重复 FASTA 标题会被拒绝；失败序列保留。这里只标注抗体，不进行序列生成。"
                  : "At most50 distinct FASTA IDs,20–2000 supported amino acids each. Failed sequences remain visible. This task annotates antibodies; it does not generate sequences."}
              </Hint>
            </>
          ),
        },
        {
          title: zh ? "选择方案" : "Choose settings",
          valid: cpu >= 1 && cpu <= 2,
          content: (
            <>
              <ChoiceCards<"accuracy" | "speed">
                label={zh ? "采用哪种编号方案？" : "Which numbering model?"}
                value={mode}
                onChange={setMode}
                options={[
                  {
                    value: "accuracy",
                    title: zh
                      ? "准确模型（推荐）"
                      : "Accuracy model (recommended)",
                    note: zh
                      ? "适合稀有或新型序列的编号探索。"
                      : "For numbering rare or novel sequence types.",
                  },
                  {
                    value: "speed",
                    title: zh ? "快速模型" : "Speed model",
                    note: zh
                      ? "较快处理；结果仍保留具体模型和权重。"
                      : "Faster processing; model and weight provenance remain explicit.",
                  },
                ]}
              />
              <details>
                <summary>{zh ? "专家微调" : "Expert settings"}</summary>
                <label className="field">
                  CPU
                  <select
                    value={cpu}
                    onChange={(e) => setCPU(Number(e.target.value))}
                  >
                    <option value={1}>1</option>
                    <option value={2}>2</option>
                  </select>
                </label>
                <label className="field">
                  {zh ? "任务名称（可选）" : "Task name (optional)"}
                  <input
                    value={name}
                    maxLength={80}
                    onChange={(e) => setName(e.target.value)}
                  />
                </label>
              </details>
            </>
          ),
        },
        {
          title: zh ? "确认标注" : "Review annotation",
          valid: Boolean(source),
          content: (
            <>
              <dl className="questionnaire-review">
                <dt>{zh ? "序列版本" : "Sequence version"}</dt>
                <dd>{source?.version_id ?? source?.asset_id}</dd>
                <dt>{zh ? "形式" : "Format"}</dt>
                <dd>
                  {format === "scfv"
                    ? "scFv"
                    : zh
                      ? "独立链/VHH"
                      : "Separate chains/VHH"}
                </dd>
                <dt>{zh ? "编号" : "Numbering"}</dt>
                <dd>IMGT · ANARCII 2.0.8 · {mode}</dd>
              </dl>
              <Hint
                label={
                  zh ? "标注能说明什么？" : "What does annotation establish?"
                }
              >
                {zh
                  ? "给出抗体链型、域的原始位置、IMGT 编号和CDR区域。模型内部编号分数不是人源程度、结合亲和力、免疫原性或可开发性。原始序列不会被覆盖。"
                  : "Chain types, original domain intervals, IMGT numbering and CDR regions. Internal numbering scores are not humanness, affinity, immunogenicity or developability. Original sequences remain intact."}
              </Hint>
            </>
          ),
        },
      ]}
    />
  );
}
