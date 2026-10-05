import { useEffect, useState } from "react";
import { request } from "../api";
import { StructureViewer } from "../viewer/StructureViewer";
import type { SceneInfo, SelectionInfo } from "../viewer/protocol";
import type { MoleculeRef } from "../research/types";
import type { Language } from "../types";
import type {
  PropertyModel,
  ScientificPayload,
  ScientificProgram,
} from "./types";

export function ScientificSelection({
  program,
  language,
  payload,
  onChange,
  structure,
  onValid,
}: {
  program: ScientificProgram;
  language: Language;
  payload: ScientificPayload;
  onChange(value: Partial<ScientificPayload>): void;
  structure: MoleculeRef | null;
  onValid(value: boolean): void;
}) {
  const zh = language === "zh";
  const [scene, setScene] = useState<SceneInfo | null>(null);
  const [models, setModels] = useState<PropertyModel[]>([]),
    [error, setError] = useState("");
  useEffect(() => {
    if (program !== "chemprop" || payload.mode !== "predict") return;
    const controller = new AbortController();
    void request<{ models: PropertyModel[] }>("/scientific/property-models", {
      signal: controller.signal,
    })
      .then((result) => {
        if (!controller.signal.aborted) setModels(result.models);
      })
      .catch((e) => {
        if (!controller.signal.aborted) setError(String(e));
      });
    return () => controller.abort();
  }, [program, payload.mode]);
  useEffect(() => {
    onValid(
      program === "ligandmpnn"
        ? Array.isArray(payload.redesigned_residues) &&
            payload.redesigned_residues.length > 0
        : program === "boltzgen"
          ? Array.isArray(payload.target_chains) &&
            payload.target_chains.length > 0
          : program === "plip"
            ? Boolean(
                payload.ligand_chain && Number.isInteger(payload.ligand_number),
              )
            : true,
    );
  }, [program, payload, onValid]);
  function selected(selection: SelectionInfo | null) {
    const identity = selection?.identity;
    if (!identity || identity.is_ligand || program !== "ligandmpnn") return;
    const key = `${identity.chain}${identity.number}${identity.insertion_code}`;
    const current = Array.isArray(payload.redesigned_residues)
      ? (payload.redesigned_residues as string[])
      : [];
    onChange({
      redesigned_residues: current.includes(key)
        ? current.filter((item) => item !== key)
        : [...current, key],
    });
  }
  if (program === "chemprop")
    return payload.mode === "train" ? (
      <>
        <label className="field">
          {zh ? "SDF 中的实验标签名称" : "Experimental label field in SDF"}
          <input
            value={String(payload.activity_property)}
            onChange={(e) => onChange({ activity_property: e.target.value })}
          />
        </label>
        <label className="field">
          {zh ? "标签单位" : "Label units"}
          <select
            value={String(payload.activity_unit)}
            onChange={(e) => onChange({ activity_unit: e.target.value })}
          >
            <option value="pIC50">pIC50</option>
            <option value="pKi">pKi</option>
            <option value="nM">nM</option>
            <option value="µM">µM</option>
            <option value="mg/L">mg/L</option>
            <option value="logP">logP</option>
          </select>
        </label>
      </>
    ) : (
      <>
        {error && <p role="alert">{error}</p>}
        <label className="field">
          {zh ? "选择已有研究模型" : "Choose a trained research model"}
          <select
            value={String(payload.model_job ?? "")}
            onChange={(e) => {
              const model = models.find(
                (item) => item.job_id === e.target.value,
              );
              onChange({
                model_job: model?.job_id ?? null,
                model_sha256: model?.sha256 ?? null,
                ...(model
                  ? {
                      activity_property: model.activity_property,
                      activity_unit: model.activity_unit,
                    }
                  : {}),
              });
            }}
          >
            <option value="">{zh ? "选择模型" : "Choose model"}</option>
            {models.map((model) => (
              <option key={model.job_id} value={model.job_id}>
                {model.name} · {model.activity_property} ({model.activity_unit})
              </option>
            ))}
          </select>
        </label>
        {!models.length && !error && (
          <p>
            {zh
              ? "先在“建立实验数据性质模型”中训练一个模型。"
              : "Train a model in Train a property model first."}
          </p>
        )}
      </>
    );
  if (["ligandmpnn", "boltzgen", "plip"].includes(program))
    return (
      <>
        {structure && (
          <StructureViewer
            urls={[`/api/assets/${structure.asset_id}`]}
            language={language}
            selectionMode="residue"
            onAtomSelected={selected}
            onSceneLoaded={setScene}
          />
        )}
        {program === "ligandmpnn" && (
          <>
            <p>
              {zh
                ? "在三维结构中点击要修改的残基，再次点击可取消。"
                : "Click residues to redesign; click again to remove."}
            </p>
            <div className="selection-chips">
              {(payload.redesigned_residues as string[]).map((item) => (
                <button
                  type="button"
                  key={item}
                  onClick={() =>
                    onChange({
                      redesigned_residues: (
                        payload.redesigned_residues as string[]
                      ).filter((r) => r !== item),
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
          <fieldset>
            <legend>
              {zh ? "选择要结合的目标链" : "Choose target chains"}
            </legend>
            {scene?.chains.map((chain) => (
              <label key={chain}>
                <input
                  type="checkbox"
                  checked={(payload.target_chains as string[]).includes(chain)}
                  onChange={(e) =>
                    onChange({
                      target_chains: e.target.checked
                        ? [...(payload.target_chains as string[]), chain]
                        : (payload.target_chains as string[]).filter(
                            (c) => c !== chain,
                          ),
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
            {zh ? "选择中心配体" : "Choose ligand"}
            <select
              value={
                payload.ligand_chain
                  ? `${payload.ligand_chain}:${payload.ligand_number}`
                  : ""
              }
              onChange={(e) => {
                const ligand = scene?.ligands.find(
                  (item) => `${item.chain}:${item.resi}` === e.target.value,
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
      </>
    );
  if (program === "boltz")
    return (
      <label className="field">
        <input
          type="checkbox"
          checked={Boolean(payload.affinity)}
          onChange={(e) => onChange({ affinity: e.target.checked })}
        />
        {zh ? "同时预测小分子亲和力" : "Also predict small-molecule affinity"}
      </label>
    );
  if (program === "openmm")
    return (
      <label className="field">
        <input
          type="checkbox"
          checked={Boolean(payload.restrain_backbone)}
          onChange={(e) => onChange({ restrain_backbone: e.target.checked })}
        />
        {zh
          ? "保护蛋白骨架，只做局部优化（推荐）"
          : "Restrain the protein backbone for local refinement (recommended)"}
      </label>
    );
  return (
    <p>
      {program === "apbs"
        ? zh
          ? "计算表面电势；pH 和盐浓度在下一步选择。"
          : "Calculate surface potential; choose pH and salt in the next step."
        : zh
          ? "生成候选并计算分子量、LogP 和 QED，便于筛选。"
          : "Generate candidates with MW, LogP and QED for review."}
    </p>
  );
}
