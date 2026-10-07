import { useState } from "react";
import { StructureViewer } from "../viewer/StructureViewer";
import type { SceneInfo, SelectionInfo } from "../viewer/protocol";
import type { MoleculeRef } from "../research/types";
import type { Language } from "../types";
import type { ScientificPayload, ScientificProgram } from "./types";
import "./target-selection.css";

export type StructureSelectionProgram = Extract<
  ScientificProgram,
  "ligandmpnn" | "boltzgen" | "plip"
>;
export function StructureTargetSelection({
  program,
  language,
  payload,
  onChange,
  structure,
}: {
  program: StructureSelectionProgram;
  language: Language;
  payload: ScientificPayload;
  onChange(value: Partial<ScientificPayload>): void;
  structure: MoleculeRef | null;
}) {
  const zh = language === "zh",
    [scene, setScene] = useState<SceneInfo | null>(null);
  const residues = Array.isArray(payload.redesigned_residues)
    ? (payload.redesigned_residues as string[])
    : [];
  const chains = Array.isArray(payload.target_chains)
    ? (payload.target_chains as string[])
    : [];
  const analyzedLigand =
    program === "plip"
      ? scene?.ligands.find(
          (item) =>
            item.chain === payload.ligand_chain &&
            item.resi === payload.ligand_number,
        )
      : undefined;
  function selected(selection: SelectionInfo | null) {
    const identity = selection?.identity;
    if (!identity || identity.is_ligand || program !== "ligandmpnn") return;
    const key = `${identity.chain}${identity.number}${identity.insertion_code}`;
    onChange({
      redesigned_residues: residues.includes(key)
        ? residues.filter((item) => item !== key)
        : [...residues, key],
    });
  }
  return (
    <div className="scientific-target-selection">
      <section
        className="scientific-target-controls"
        aria-label={zh ? "研究目标选择" : "Research target selection"}
      >
        <h3>
          {program === "plip"
            ? zh
              ? "选择要分析的配体"
              : "Choose the ligand to analyze"
            : program === "boltzgen"
              ? zh
                ? "选择要结合的目标链"
                : "Choose target chains"
              : zh
                ? "选择要修改的残基"
                : "Choose residues to redesign"}
        </h3>
        <p className="field-help">
          {program === "ligandmpnn"
            ? zh
              ? "在结构中点击残基；再次点击可取消。下方保留确切的链与残基编号。"
              : "Select residues in the structure; select again to remove. Exact chain and residue identifiers appear below."
            : program === "boltzgen"
              ? zh
                ? "选择研究对象所在的链，再通过旁边的结构核对。"
                : "Choose the target's chains and check them against the structure."
              : zh
                ? "从这份结构实际包含的配体中选择一个。"
                : "Choose one ligand actually present in this structure."}
        </p>
        {!structure ? (
          <p role="status">
            {zh
              ? "先在上一步选择结构文件。"
              : "Choose a structure in the previous step."}
          </p>
        ) : !scene ? (
          <p role="status">
            {zh
              ? "正在读取结构中的链和残基…"
              : "Reading chains and residues from the structure…"}
          </p>
        ) : null}
        {program === "ligandmpnn" && (
          <>
            <p className="scientific-selection-count" role="status">
              {zh
                ? `已选择 ${residues.length} 个残基`
                : `${residues.length} residues selected`}
            </p>
            <div className="selection-chips">
              {residues.map((item) => (
                <button
                  type="button"
                  key={item}
                  aria-label={
                    zh ? `取消残基 ${item}` : `Remove residue ${item}`
                  }
                  onClick={() =>
                    onChange({
                      redesigned_residues: residues.filter((r) => r !== item),
                    })
                  }
                >
                  {item} ×
                </button>
              ))}
            </div>
          </>
        )}
        {program === "boltzgen" && (
          <fieldset className="scientific-target-options">
            <legend className="sr-only">
              {zh ? "目标链" : "Target chains"}
            </legend>
            {scene?.chains.map((chain) => (
              <label
                key={chain}
                className={chains.includes(chain) ? "selected" : ""}
              >
                <input
                  type="checkbox"
                  checked={chains.includes(chain)}
                  onChange={(event) =>
                    onChange({
                      target_chains: event.target.checked
                        ? [...chains, chain]
                        : chains.filter((c) => c !== chain),
                    })
                  }
                />
                {zh ? "链 " : "Chain "}
                {chain}
              </label>
            ))}
          </fieldset>
        )}
        {program === "plip" && (
          <label className="field">
            {zh ? "分析配体" : "Ligand to analyze"}
            <select
              disabled={!scene}
              value={
                payload.ligand_chain
                  ? `${payload.ligand_chain}:${payload.ligand_number}`
                  : ""
              }
              onChange={(event) => {
                const ligand = scene?.ligands.find(
                  (item) => `${item.chain}:${item.resi}` === event.target.value,
                );
                onChange({
                  ligand_chain: ligand?.chain ?? "",
                  ligand_number: ligand?.resi,
                });
              }}
            >
              <option value="">{zh ? "选择配体" : "Choose ligand"}</option>
              {scene?.ligands.map((item) => (
                <option key={item.key} value={`${item.chain}:${item.resi}`}>
                  {item.resn} · {item.chain}:{item.resi}
                </option>
              ))}
            </select>
          </label>
        )}
        {scene && program === "plip" && scene.ligands.length === 0 && (
          <p role="status">
            {zh
              ? "这份结构中没有可选择的配体，请核对上一步的文件。"
              : "No selectable ligand is present. Check the source file in the previous step."}
          </p>
        )}
      </section>
      <div className="scientific-target-preview">
        {structure && (
          <StructureViewer
            urls={[`/api/assets/${structure.asset_id}`]}
            language={language}
            focusLigand={analyzedLigand?.key}
            selectionMode="residue"
            onAtomSelected={selected}
            onSceneLoaded={setScene}
          />
        )}
      </div>
    </div>
  );
}
