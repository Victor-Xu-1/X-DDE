import { useState } from "react";
import type { Component, Job, Language, Parameters } from "../types";
import { MolecularInputs } from "../guided/MolecularInputs";
import { defaults } from "../form-model";
import { useTaskSubmit } from "./useTaskSubmit";

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
  const parameters: Parameters = {
    ...defaults,
    feature_mode: "search",
    allow_network: consent,
    use_template: operation !== "msa",
    use_rna_msa: operation === "prep",
    search_cpus: cpus,
  };
  return (
    <form
      className="tool-form"
      onSubmit={(e) => {
        e.preventDefault();
        void run.submit({
          operation,
          name: zh ? "准备进化特征" : "Prepare evolutionary features",
          components,
          parameters,
        });
      }}
    >
      <fieldset disabled={run.busy}>
        <label className="field">
          {zh ? "需要准备哪些信息？" : "Which features do you need?"}
          <select
            value={operation}
            onChange={(e) => setOperation(e.target.value as typeof operation)}
          >
            <option value="msa">{zh ? "蛋白 MSA" : "Protein MSA"}</option>
            <option value="mt">
              {zh
                ? "蛋白 MSA ＋ 结构模板"
                : "Protein MSA + structure templates"}
            </option>
            <option value="prep">
              {zh
                ? "完整准备：蛋白 MSA ＋ 模板 ＋ RNA MSA"
                : "Full preparation: protein MSA + templates + RNA MSA"}
            </option>
          </select>
        </label>
        <MolecularInputs
          items={components}
          onChange={setComponents}
          language={language}
          expert
          workflow="protein"
        />
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
        {run.error && (
          <p role="alert" className="error-box">
            {run.error}
          </p>
        )}
        <button className="primary-button" disabled={!consent}>
          {run.busy
            ? zh
              ? "提交中…"
              : "Submitting…"
            : zh
              ? "开始准备"
              : "Prepare features"}
        </button>
      </fieldset>
    </form>
  );
}
