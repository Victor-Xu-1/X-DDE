import { ChoiceCards } from "../guided/ChoiceCards";
import { useId, useState } from "react";
import type { Job, Language } from "../types";
import type { MoleculeRef } from "../research/types";
import { AssetPicker } from "./AssetPicker";
import { useTaskSubmit } from "./useTaskSubmit";
import { Hint } from "../guided/Hint";
import { Questionnaire } from "../guided/Questionnaire";
import { useTaskReadiness } from "../guided/useTaskReadiness";
export function PropertyForm({
  language,
  onCreated,
  initialSmiles = "",
  initialFile = "",
  scientificInput,
}: {
  language: Language;
  onCreated(j: Job): void;
  initialSmiles?: string;
  initialFile?: string;
  scientificInput?: MoleculeRef;
}) {
  const id = useId(),
    zh = language === "zh",
    [smiles, setSmiles] = useState(initialSmiles),
    [file, setFile] = useState(initialFile),
    [name, setName] = useState(""),
    [mode, setMode] = useState<"file" | "smiles" | "both">(
      initialFile && initialSmiles ? "both" : initialSmiles ? "smiles" : "file",
    );
  const run = useTaskSubmit(onCreated);
  const { ready, error } = useTaskReadiness("properties");
  const lines =
      mode === "file"
        ? []
        : smiles
            .split(/\r?\n/)
            .map((s) => s.trim())
            .filter(Boolean),
    selectedFile = mode === "smiles" ? "" : file;
  const valid = Boolean(selectedFile || lines.length) && lines.length <= 500;
  const bound = Boolean(
    scientificInput && selectedFile === scientificInput.asset_id,
  );
  const objects = (
    <>
      {mode !== "file" && (
        <div className="field">
          <span>
            <label htmlFor={id}>SMILES</label>{" "}
            <Hint label={zh ? "SMILES说明" : "SMILES help"}>
              {zh
                ? "用文字表示分子结构。一行一个分子，不附名称或表头；如果不熟悉，可返回上一步选择分子文件。"
                : "A text representation of molecular structure. One molecule per line without names/headers; choose a molecular file instead if unfamiliar."}
            </Hint>
          </span>
          <textarea
            id={id}
            value={smiles}
            onChange={(e) => setSmiles(e.target.value)}
            rows={5}
            spellCheck={false}
            maxLength={200000}
          />
          {lines.length > 500 && (
            <p role="alert">
              {zh
                ? "每次最多填写500个分子，请分批提交。"
                : "Enter up to 500 molecules per task; split larger batches."}
            </p>
          )}
        </div>
      )}
      {mode !== "smiles" && (
        <AssetPicker
          kind="ligand"
          value={file}
          onChange={setFile}
          language={language}
          label={
            zh
              ? "分子文件（可含多个记录）"
              : "Molecule file (multiple records allowed)"
          }
        />
      )}
      {bound && (
        <p
          className="field-help"
          title={`Version: ${scientificInput!.version_id ?? "file"}; SHA256: ${scientificInput!.sha256}`}
        >
          {zh
            ? `已复用第${scientificInput!.record + 1}个分子记录，仅计算此记录。`
            : `Reusing molecule record ${scientificInput!.record + 1}; only this record is calculated.`}
        </p>
      )}
    </>
  );
  return (
    <Questionnaire
      language={language}
      busy={run.busy}
      error={error || run.error}
      ready={ready}
      unavailable={
        zh
          ? "性质计算环境尚未就绪。请到“安装与组件”配置 OpenDDE 的分子性质工具；当前输入可以保留。"
          : "The molecular-property runtime is not ready. Configure OpenDDE's molecular-property tools in Installation & components; keep your prepared inputs."
      }
      submitLabel={zh ? "计算性质" : "Calculate properties"}
      onSubmit={() =>
        run.submit({
          operation: "properties",
          scientific_inputs: bound ? [scientificInput!] : [],
          name: name.trim() || (zh ? "小分子性质" : "Molecular properties"),
          smiles: lines,
          ligand_files: selectedFile ? [selectedFile] : [],
        })
      }
      steps={[
        {
          title: zh ? "选择方式" : "Choose source",
          valid: true,
          content: (
            <ChoiceCards<"file" | "smiles" | "both">
              label={
                zh ? "用哪种方式提供分子？" : "How will you provide molecules?"
              }
              value={mode}
              onChange={setMode}
              options={[
                {
                  value: "file",
                  title: zh
                    ? "上传或复用分子文件（推荐）"
                    : "Upload or reuse a molecular file (recommended)",
                  note: zh
                    ? "保留文件和研究版本的来源。"
                    : "Retain file and research-version provenance.",
                },
                {
                  value: "smiles",
                  title: zh
                    ? "粘贴分子结构文字（SMILES）"
                    : "Paste molecular structure text (SMILES)",
                  note: zh
                    ? "每行输入一个 SMILES。"
                    : "Enter one SMILES per line.",
                },
                {
                  value: "both",
                  title: zh
                    ? "文件和文字一起计算"
                    : "Combine file and text inputs",
                  note: zh ? "同时使用两类输入。" : "Use both input sources.",
                },
              ]}
            />
          ),
        },
        {
          title: zh ? "提供分子" : "Provide molecules",
          valid,
          content: objects,
        },
        {
          title: zh ? "确认内容" : "Choose calculation",
          valid: true,
          content: (
            <>
              <p>
                {zh
                  ? "推荐：计算基础分子性质，不需要先预测蛋白结构。"
                  : "Recommended: calculate basic molecular properties; no protein prediction required."}
              </p>
              <Hint label={zh ? "性质计算范围" : "Property calculation scope"}>
                {zh
                  ? "包括分子量、脂溶性、极性表面积、氢键与柔性、类药性和合成难易度启发式指标。这些是结构描述符，不是 ADMET 预测或实验活性。"
                  : "Includes molecular weight, lipophilicity, polar surface area, hydrogen bonding/flexibility, drug-likeness and synthetic-accessibility heuristics. These are descriptors, not ADMET or experimental activity."}
              </Hint>
              <label className="field">
                {zh ? "任务名称（可选）" : "Task name (optional)"}
                <input
                  value={name}
                  maxLength={80}
                  onChange={(e) => setName(e.target.value)}
                />
              </label>
            </>
          ),
        },
        {
          title: zh ? "确认启动" : "Review & start",
          valid: true,
          content: (
            <dl className="questionnaire-review">
              <dt>{zh ? "输入方式" : "Input source"}</dt>
              <dd>
                {mode === "file"
                  ? zh
                    ? "分子文件"
                    : "Molecular file"
                  : mode === "smiles"
                    ? "SMILES"
                    : zh
                      ? "分子文件＋SMILES"
                      : "File and SMILES"}
              </dd>
              <dt>{zh ? "分子范围" : "Molecule selection"}</dt>
              <dd>
                {bound
                  ? zh
                    ? `已选文件第${scientificInput!.record + 1}条记录`
                    : `Selected file record ${scientificInput!.record + 1}`
                  : zh
                    ? `${lines.length}条文字结构${selectedFile ? "，另含已选文件" : ""}`
                    : `${lines.length} text structures${selectedFile ? " plus the selected file" : ""}`}
              </dd>
              <dt>{zh ? "计算内容" : "Calculation"}</dt>
              <dd>
                {zh ? "基础分子性质组合" : "Basic molecular property panel"}
              </dd>
            </dl>
          ),
        },
      ]}
    />
  );
}
