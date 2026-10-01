import { useState } from "react";
import type { Component, Job, Language, Parameters } from "../types";
import { MolecularInputs } from "../guided/MolecularInputs";
import { defaults, validate } from "../form-model";
import { useTaskSubmit } from "./useTaskSubmit";
import { Questionnaire } from "../guided/Questionnaire";
import { useTaskReadiness } from "../guided/useTaskReadiness";
import { Hint } from "../guided/Hint";

export function FeatureForm({
  language,
  onCreated,
}: {
  language: Language;
  onCreated(j: Job): void;
}) {
  const zh = language === "zh",
    [operation, setOperation] = useState<"msa" | "mt" | "prep">("msa"),
    [components, setComponents] = useState<Component[]>([
      { kind: "protein", value: "", count: 1 },
    ]),
    [consent, setConsent] = useState(false),
    [cpus, setCpus] = useState(4),
    run = useTaskSubmit(onCreated);
  const [expert, setExpert] = useState(false);
  const { ready, error } = useTaskReadiness("features");
  const parameters: Parameters = {
    ...defaults,
    feature_mode: "search",
    allow_network: consent,
    use_template: operation !== "msa",
    use_rna_msa: operation === "prep",
    search_cpus: cpus,
  };
  const goal = (
    <>
      {" "}
      <label className="field">
        {zh ? "需要准备哪些信息？" : "Which features do you need?"}
        <select
          value={operation}
          onChange={(e) => setOperation(e.target.value as typeof operation)}
        >
          <option value="msa">{zh ? "蛋白 MSA" : "Protein MSA"}</option>
          <option value="mt">
            {zh ? "蛋白 MSA ＋ 结构模板" : "Protein MSA + structure templates"}
          </option>
          <option value="prep">
            {zh
              ? "完整准备：蛋白 MSA ＋ 模板 ＋ RNA MSA"
              : "Full preparation: protein MSA + templates + RNA MSA"}
          </option>
        </select>
      </label>
      <Hint label={zh ? "特征准备说明" : "Feature preparation help"}>
        {zh
          ? "MSA 是同源序列比对，模板是已知结构信息。按研究需要选择一种方案；它们为后续结构预测提供输入，不生成药物分子。"
          : "MSA aligns homologous sequences; templates provide known structure information. Choose the preparation needed for later structure prediction."}
      </Hint>
    </>
  );
  const inputs = (
    <>
      {" "}
      <MolecularInputs
        items={components}
        onChange={setComponents}
        language={language}
        expert={expert}
        showHeading={false}
        allowedKinds={operation === "prep" ? ["protein", "rna"] : ["protein"]}
        workflow="protein"
      />
    </>
  );
  const options = (
    <>
      <button
        type="button"
        className="secondary-button"
        aria-pressed={expert}
        onClick={() => setExpert(!expert)}
      >
        {expert
          ? zh
            ? "返回推荐方案"
            : "Return to recommendation"
          : zh
            ? "专家微调"
            : "Expert settings"}
      </button>
      {expert && (
        <>
          {" "}
          {operation === "prep" && (
            <p className="notice">
              {zh
                ? "完整准备处理输入中已有的蛋白和 RNA；所用的模板/RNA 数据库需先安装。"
                : "Full preparation processes the proteins and RNA supplied; install the corresponding databases first."}
            </p>
          )}
          <label className="field">
            {zh ? "RNA 搜索 CPU 数" : "RNA search CPUs"}
            <select
              value={cpus}
              onChange={(e) => setCpus(Number(e.target.value))}
            >
              {[2, 4, 8, 16, 32].map((n) => (
                <option key={n}>{n}</option>
              ))}
            </select>
          </label>
        </>
      )}
      <label className="network-choice">
        <input
          type="checkbox"
          checked={consent}
          onChange={(e) => setConsent(e.target.checked)}
        />
        {zh
          ? "允许向配置的 MSA 服务发送序列并下载模板。"
          : "Allow sequence transmission to the configured MSA service and template downloads."}
      </label>
    </>
  );
  const review = (
    <dl className="questionnaire-review">
      <dt>{zh ? "准备内容" : "Preparation"}</dt>
      <dd>
        {operation === "msa"
          ? "MSA"
          : operation === "mt"
            ? "MSA + templates"
            : "MSA + templates + RNA MSA"}
      </dd>
      <dt>{zh ? "输入" : "Input"}</dt>
      <dd>
        {components.length} {zh ? "个序列组分" : "sequence components"}
      </dd>
      <dt>{zh ? "计算设置" : "Compute settings"}</dt>
      <dd>
        {zh ? "沿用所选服务与数据库" : "Use configured service and databases"}
      </dd>
    </dl>
  );
  return (
    <Questionnaire
      language={language}
      ready={ready}
      busy={run.busy}
      error={run.error || error}
      unavailable={
        zh
          ? "特征准备环境尚未配置。请到安装与组件检查 OpenDDE、搜索服务和所需数据库。"
          : "Configure OpenDDE, the search service and required databases in Installation & components."
      }
      submitLabel={zh ? "开始准备" : "Prepare features"}
      onSubmit={() =>
        run.submit({
          operation,
          name: zh ? "准备进化特征" : "Prepare evolutionary features",
          components,
          parameters,
        })
      }
      steps={[
        {
          title: zh ? "选择内容" : "Choose features",
          content: goal,
          valid: true,
        },
        {
          title: zh ? "提供序列" : "Provide sequences",
          content: inputs,
          valid:
            !validate("Feature preparation", components) &&
            components.some((c) =>
              operation === "prep"
                ? c.kind === "protein" || c.kind === "rna"
                : c.kind === "protein",
            ),
        },
        {
          title: zh ? "选择方案" : "Choose settings",
          content: options,
          valid: consent,
        },
        {
          title: zh ? "确认启动" : "Review & start",
          content: review,
          valid: consent,
        },
      ]}
    />
  );
}
