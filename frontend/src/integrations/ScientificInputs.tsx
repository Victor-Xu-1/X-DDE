import { ReferencePicker } from "../diffsbdd/ReferencePicker";
import { Hint } from "../guided/Hint";
import type { Language } from "../types";
import type { MoleculeRef } from "../research/types";
import type { ScientificPayload, ScientificProgram } from "./types";
import { LibraryInput } from "./LibraryInput";
import { BoltzInputs } from "./BoltzInputs";
import { ReinventInputs } from "./ReinventInputs";

export function ScientificInputs({
  program,
  language,
  payload,
  onChange,
  structure,
  onStructure,
  ligand,
  onLigand,
  onLibraryVerified,
  scaffold,
  onScaffold,
  onBoltzMsaVerified,
}: {
  program: ScientificProgram;
  language: Language;
  payload: ScientificPayload;
  onChange(value: Partial<ScientificPayload>): void;
  structure: MoleculeRef | null;
  onStructure(value: MoleculeRef | null): void;
  ligand: MoleculeRef | null;
  onLigand(value: MoleculeRef | null): void;
  onLibraryVerified(value: MoleculeRef | null): void;
  scaffold: MoleculeRef | null;
  onScaffold(value: MoleculeRef | null): void;
  onBoltzMsaVerified?(chain: string, key: string): void;
}) {
  const zh = language === "zh";
  if (program === "boltz")
    return (
      <BoltzInputs
        payload={payload}
        onChange={onChange}
        language={language}
        onMsaVerified={onBoltzMsaVerified}
      />
    );
  if (program === "reinvent")
    return (
      <ReinventInputs
        language={language}
        payload={payload}
        onChange={onChange}
        ligand={ligand}
        onLigand={onLigand}
      />
    );
  if (program === "chemprop")
    return (
      <LibraryInput
        language={language}
        value={ligand}
        onChange={onLigand}
        onVerified={onLibraryVerified}
      />
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
