import { useState } from "react";
import type { Job, Language } from "../types";
import { AssetPicker } from "./AssetPicker";
import { useTaskSubmit } from "./useTaskSubmit";
import { Hint } from "../guided/Hint";

export function PropertyForm({
  language,
  onCreated,
}: {
  language: Language;
  onCreated(j: Job): void;
}) {
  const zh = language === "zh",
    [smiles, setSmiles] = useState(""),
    [file, setFile] = useState(""),
    [name, setName] = useState(""),
    run = useTaskSubmit(onCreated);
  return (
    <form
      className="tool-form"
      onSubmit={(e) => {
        e.preventDefault();
        void run.submit({
          operation: "properties",
          name: name.trim() || (zh ? "小分子性质" : "Molecular properties"),
          smiles: smiles
            .split(/\r?\n/)
            .map((s) => s.trim())
            .filter(Boolean),
          ligand_files: file ? [file] : [],
        });
      }}
    >
      <fieldset disabled={run.busy}>
        <p>
          {zh
            ? "粘贴 SMILES 或上传分子文件，即可直接计算，不需要先做结构预测。每次最多 500 个分子。"
            : "Paste SMILES or upload molecules to calculate directly, without structure prediction. Up to 500 molecules per task."}
        </p>
        <label className="field">
          SMILES{" "}
          <Hint label={zh ? "SMILES 说明" : "SMILES help"}>
            {zh
              ? "一行一个分子，不附加名称或表头；也可以只上传 SDF。"
              : "One molecule per line without names or headers. You can instead upload SDF."}
          </Hint>
          <textarea
            value={smiles}
            onChange={(e) => setSmiles(e.target.value)}
            rows={7}
            spellCheck={false}
            maxLength={200000}
          />
        </label>
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
        <label className="field">
          {zh ? "任务名称（可选）" : "Task name (optional)"}
          <input
            value={name}
            maxLength={80}
            onChange={(e) => setName(e.target.value)}
          />
        </label>
        <p className="notice">
          {zh
            ? "MW：分子量；LogP：脂溶性；TPSA：极性表面积；QED：类药性；SA：合成难易度启发式指标（越低越容易）。这些是计算描述符，不是 ADMET 预测或实验活性。"
            : "MW: molecular weight; LogP: lipophilicity; TPSA: polar surface area; QED: drug-likeness; SA: synthetic-accessibility heuristic (lower is easier). These are descriptors, not ADMET or experimental potency."}
        </p>
        {run.error && (
          <p role="alert" className="error-box">
            {run.error}
          </p>
        )}
        <button className="primary-button" disabled={!smiles.trim() && !file}>
          {run.busy
            ? zh
              ? "正在提交…"
              : "Submitting…"
            : zh
              ? "计算性质"
              : "Calculate properties"}
        </button>
      </fieldset>
    </form>
  );
}
