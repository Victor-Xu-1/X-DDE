import { useState } from "react";
import { StructureViewer } from "../viewer/StructureViewer";
import { MoleculeImage } from "../presentation/MoleculeImage";
import type { Language } from "../types";
import type { PreparedExample } from "./types";
import "./study-input-preview.css";

/** Real reference inputs are deliberately separate from computed binding results. */
export function StudyInputPreview({
  example,
  language,
}: {
  example: PreparedExample;
  language: Language;
}) {
  const zh = language === "zh";
  const [key, setKey] = useState("study_ligand");
  const [mode, setMode] = useState<"2d" | "3d">("3d");
  const choices = [
    ["study_ligand", "指定小分子", "Study small molecule"],
    ["study_protac", "指定 PROTAC", "Study PROTAC"],
    ["structure", "STAT6 实验参考", "STAT6 experimental reference"],
    ["crbn_receptor", "CRBN 参考结构", "CRBN reference construct"],
  ];
  const reference = example.objects[key].reference;
  const url = `/api/assets/${reference.asset_id}`;
  const molecule = key === "study_ligand" || key === "study_protac";
  const definition = example.study?.molecules?.find(
    (item) => item.input_key === key,
  );
  const label = choices.find((item) => item[0] === key)![zh ? 1 : 2];
  return (
    <section
      className="study-input-preview"
      aria-label={zh ? "STAT6 研究材料" : "STAT6 study inputs"}
    >
      <div className="segmented" aria-label={zh ? "选择材料" : "Choose input"}>
        {choices.map(([id, cn, en]) => (
          <button
            key={id}
            type="button"
            aria-pressed={key === id}
            onClick={() => setKey(id)}
          >
            {zh ? cn : en}
          </button>
        ))}
      </div>
      <div className="study-preview-actions">
        {molecule && (
          <div
            className="segmented"
            aria-label={zh ? "分子视图" : "Molecule view"}
          >
            {(["2d", "3d"] as const).map((view) => (
              <button
                key={view}
                type="button"
                aria-pressed={mode === view}
                onClick={() => setMode(view)}
              >
                {view.toUpperCase()}
              </button>
            ))}
          </div>
        )}
        <a href={url} download className="text-button">
          {zh ? "下载原始材料" : "Download source input"}
        </a>
      </div>
      <p className="muted study-geometry-note">
        {molecule
          ? zh
            ? "MMFF94s 最小化的未结合态构象；不是对接或三元复合物结果。"
            : "MMFF94s-minimized unbound conformer; not a docking or ternary-complex result."
          : key === "structure"
            ? zh
              ? "9BIG 的实验参考：AK-1690 与指定分子不同，缺失残基未补建。"
              : "Experimental reference 9BIG: AK-1690 differs from the study molecules; unresolved residues have not been rebuilt."
            : zh
              ? "8RQA 的 CRBN-midi 实验构建体参考；不是指定 PROTAC 的结合结构。"
              : "Experimental CRBN-midi reference from 8RQA; not a bound structure of the supplied PROTAC."}
      </p>
      {key === "study_protac" && (
        <p className="muted">
          {zh
            ? "输入有一个未指定手性中心，当前构象不指定唯一 R/S 构型。"
            : "The input has one unspecified stereocenter; this conformer does not assign a unique R/S configuration."}
        </p>
      )}
      {molecule && mode === "2d" ? (
        <MoleculeImage
          key={key}
          source={definition ? { smiles: definition.original_smiles } : null}
          language={language}
          label={label}
        />
      ) : (
        <StructureViewer
          key={key}
          urls={[url]}
          language={language}
          records={[reference.record]}
          initialMode="cartoon"
        />
      )}
      <table className="compact-table">
        <thead>
          <tr>
            <th>{zh ? "材料" : "Input"}</th>
            <th>{zh ? "来源与用途" : "Source and use"}</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>STAT6 · P42226</td>
            <td>
              {zh
                ? "人 STAT6，847 aa；序列预测使用全长，实验受体保留原构建体。"
                : "Human STAT6, 847 aa; sequence tasks use the canonical sequence, while experimental receptors retain their deposited constructs."}
            </td>
          </tr>
          <tr>
            <td>9BIG · AK-1690</td>
            <td>
              {zh
                ? "实验结合姿势用于选择参考口袋，不能当作指定分子的姿势。"
                : "The deposited bound pose locates a reference pocket; it is not a pose of the supplied molecule."}
            </td>
          </tr>
        </tbody>
      </table>
    </section>
  );
}
