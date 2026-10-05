import { ReferencePicker } from "../diffsbdd/ReferencePicker";
import { Hint } from "../guided/Hint";
import type { Language } from "../types";
import type { MoleculeRef } from "../research/types";
import type { ScientificPayload, ScientificProgram } from "./types";
import { LibraryInput } from "./LibraryInput";
import { MoleculeImage } from "../presentation/MoleculeImage";

export function ScientificInputs({
  program,
  language,
  payload,
  onChange,
  structure,
  onStructure,
  ligand,
  onLigand,
  scaffold,
  onScaffold,
}: {
  program: ScientificProgram;
  language: Language;
  payload: ScientificPayload;
  onChange(value: Partial<ScientificPayload>): void;
  structure: MoleculeRef | null;
  onStructure(value: MoleculeRef | null): void;
  ligand: MoleculeRef | null;
  onLigand(value: MoleculeRef | null): void;
  scaffold: MoleculeRef | null;
  onScaffold(value: MoleculeRef | null): void;
}) {
  const zh = language === "zh";
  if (program === "boltz") {
    const components = payload.components as {
      id: string;
      kind: string;
      value: string;
      source?: MoleculeRef | null;
    }[];
    return (
      <div className="scientific-input-grid">
        {components.map((component, index) => (
          <div key={index} className="scientific-component-input">
            <div className="inline-fields">
              <label>
                {zh ? "分子类型" : "Molecular type"}
                <select
                  value={component.kind}
                  onChange={(e) =>
                    onChange({
                      components: components.map((c, i) =>
                        i === index
                          ? {
                              ...c,
                              kind: e.target.value,
                              value: "",
                              source: null,
                            }
                          : c,
                      ),
                    })
                  }
                >
                  <option value="protein">{zh ? "蛋白" : "Protein"}</option>
                  <option value="ligand">
                    {zh ? "小分子" : "Small molecule"}
                  </option>
                  <option value="rna">RNA</option>
                  <option value="dna">DNA</option>
                </select>
              </label>
              <label>
                {zh ? "链编号" : "Chain"}
                <input
                  maxLength={8}
                  value={component.id}
                  onChange={(e) =>
                    onChange({
                      components: components.map((c, i) =>
                        i === index ? { ...c, id: e.target.value } : c,
                      ),
                    })
                  }
                />
              </label>
            </div>
            {component.kind === "ligand" &&
              !components.some((c, i) => i !== index && c.source) && (
                <ReferencePicker
                  kind="ligand"
                  value={component.source ?? null}
                  onChange={(value) =>
                    onChange({
                      components: components.map((c, i) =>
                        i === index ? { ...c, source: value, value: "" } : c,
                      ),
                    })
                  }
                  language={language}
                  label={zh ? "上传小分子结构" : "Upload molecular structure"}
                  allowedSuffixes={[".sdf", ".mol"]}
                />
              )}
            <label>
              {component.kind === "ligand"
                ? "SMILES"
                : zh
                  ? "序列"
                  : "Sequence"}
              <textarea
                rows={component.kind === "ligand" ? 2 : 5}
                value={component.value}
                onChange={(e) =>
                  onChange({
                    components: components.map((c, i) =>
                      i === index
                        ? {
                            ...c,
                            source: null,
                            value: e.target.value.replace(/\s/g, ""),
                          }
                        : c,
                    ),
                  })
                }
              />
            </label>
            {component.kind === "ligand" &&
              (component.value || component.source) && (
                <MoleculeImage
                  source={
                    component.source
                      ? {
                          url: `/api/assets/${component.source.asset_id}`,
                          record: component.source.record,
                        }
                      : { smiles: component.value }
                  }
                  language={language}
                  label={zh ? "本次输入分子" : "Entered molecule"}
                />
              )}
            {components.length > 1 && (
              <button
                type="button"
                className="text-button"
                onClick={() =>
                  onChange({
                    components: components.filter((_, i) => i !== index),
                  })
                }
              >
                {zh ? "移除此组分" : "Remove component"}
              </button>
            )}
          </div>
        ))}
        {components.length < 8 && (
          <button
            type="button"
            className="secondary-button"
            onClick={() =>
              onChange({
                components: [
                  ...components,
                  {
                    id: String.fromCharCode(65 + components.length),
                    kind: "protein",
                    value: "",
                  },
                ],
              })
            }
          >
            {zh ? "添加一个组分" : "Add component"}
          </button>
        )}
      </div>
    );
  }
  if (program === "reinvent")
    return (
      <>
        <label className="field">
          {zh ? "想怎样设计分子？" : "How would you like to design molecules?"}
          <select
            value={String(payload.mode)}
            onChange={(e) => {
              onChange({ mode: e.target.value });
              onLigand(null);
            }}
          >
            <option value="analogues">
              {zh ? "从已有分子寻找类似物" : "Find analogues of a molecule"}
            </option>
            <option value="optimize">
              {zh
                ? "围绕已有分子优化性质"
                : "Optimize properties around a molecule"}
            </option>
            <option value="de_novo">
              {zh ? "从头生成" : "De novo generation"}
            </option>
            <option value="r_groups">
              {zh ? "替换 R 基" : "Replace R-groups"}
            </option>
            <option value="linker">
              {zh ? "连接两个片段" : "Link two fragments"}
            </option>
          </select>
        </label>
        {["analogues", "optimize"].includes(String(payload.mode)) ? (
          <ReferencePicker
            kind="ligand"
            value={ligand}
            onChange={onLigand}
            language={language}
            label={zh ? "选择起始分子" : "Choose starting molecule"}
            allowedSuffixes={[".sdf", ".mol"]}
          />
        ) : (
          payload.mode !== "de_novo" && (
            <label className="field">
              {zh
                ? "片段结构（每行一个）"
                : "Fragment structures (one per line)"}
              <Hint label={zh ? "连接位点说明" : "Attachment point help"}>
                {zh
                  ? "使用 * 标记要连接或替换的位置；连接子设计需要两个片段。"
                  : "Mark attachment positions with *. Linker design requires two fragments."}
              </Hint>
              <textarea
                rows={4}
                value={
                  Array.isArray(payload.fragments)
                    ? payload.fragments.join("\n")
                    : ""
                }
                onChange={(e) =>
                  onChange({
                    fragments: e.target.value.split(/\r?\n/).filter(Boolean),
                  })
                }
              />
            </label>
          )
        )}
      </>
    );
  if (program === "chemprop")
    return (
      <LibraryInput language={language} value={ligand} onChange={onLigand} />
    );
  return (
    <>
      {program === "boltzgen" && (
        <label className="field">
          {zh ? "设计形式" : "Design modality"}
          <select
            value={String(payload.modality)}
            onChange={(e) => {
              onChange({
                modality: e.target.value,
                length: e.target.value === "peptide" ? [15, 30] : [80, 120],
                scaffold_chain: null,
                scaffold_residues: [],
              });
              onScaffold(null);
            }}
          >
            <option value="protein">
              {zh ? "结合蛋白" : "Protein binder"}
            </option>
            <option value="peptide">{zh ? "肽" : "Peptide"}</option>
            <option value="antibody">
              {zh ? "抗体可变区" : "Antibody variable region"}
            </option>
            <option value="nanobody">{zh ? "纳米抗体" : "Nanobody"}</option>
          </select>
        </label>
      )}
      <ReferencePicker
        kind="structure"
        value={structure}
        onChange={onStructure}
        language={language}
        label={zh ? "选择目标结构" : "Choose target structure"}
        allowedSuffixes={[".pdb", ".cif"]}
      />
      {program === "boltzgen" &&
        ["antibody", "nanobody"].includes(String(payload.modality)) && (
          <ReferencePicker
            kind="structure"
            value={scaffold}
            onChange={onScaffold}
            language={language}
            label={
              zh ? "选择抗体框架结构" : "Choose antibody framework structure"
            }
            allowedSuffixes={[".pdb", ".cif"]}
          />
        )}
      {program === "openmm" && (
        <details>
          <summary>
            {zh ? "同时优化结合的小分子" : "Also refine a bound ligand"}
          </summary>
          <ReferencePicker
            kind="ligand"
            value={ligand}
            onChange={onLigand}
            language={language}
            label={
              zh
                ? "选择同一坐标系的结合姿势"
                : "Choose pose in the same coordinate frame"
            }
            allowedSuffixes={[".sdf", ".mol"]}
          />
        </details>
      )}
    </>
  );
}
