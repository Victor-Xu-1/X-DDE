import { useEffect } from "react";
import { StructureTargetSelection } from "./StructureTargetSelection";
import { PropertyModelSelection } from "./PropertyModelSelection";

import type { MoleculeRef } from "../research/types";
import type { Language } from "../types";
import type { ScientificPayload, ScientificProgram } from "./types";

export function ScientificSelection({
  program,
  language,
  payload,
  onChange,
  structure,
  onValid,
  onTrainModel,
}: {
  program: ScientificProgram;
  language: Language;
  payload: ScientificPayload;
  onChange(value: Partial<ScientificPayload>): void;
  structure: MoleculeRef | null;
  onValid(value: boolean): void;
  onTrainModel?(): void;
}) {
  const zh = language === "zh";

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
      <PropertyModelSelection
        language={language}
        payload={payload}
        onChange={onChange}
        onTrainModel={onTrainModel}
      />
    );
  if (program === "ligandmpnn" || program === "boltzgen" || program === "plip")
    return (
      <StructureTargetSelection
        key={
          program +
          ":" +
          (structure?.asset_id ?? "") +
          ":" +
          (structure?.sha256 ?? "")
        }
        program={program}
        language={language}
        payload={payload}
        onChange={onChange}
        structure={structure}
      />
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
