import type { Language } from "../types";
import type { MoleculeRef } from "../research/types";
import type { DiffMode } from "./types";
import { isDesign } from "./types";
import { referenceKey } from "./model";
import { ReferencePicker } from "./ReferencePicker";
import { DesignOptions } from "./DesignOptions";
export function DiffInputQuestions({
  language,
  needsProtein,
  needsMolecule,
  collectionMode,
  protein,
  molecule,
  collection,
  selectProtein,
  selectMolecule,
  setCollection,
}: {
  language: Language;
  needsProtein: boolean;
  needsMolecule: boolean;
  collectionMode: boolean;
  protein: MoleculeRef | null;
  molecule: MoleculeRef | null;
  collection: MoleculeRef[];
  selectProtein(value: MoleculeRef | null): void;
  selectMolecule(value: MoleculeRef | null): void;
  setCollection(value: MoleculeRef[]): void;
}) {
  const zh = language === "zh";
  return (
    <>
      {" "}
      {needsProtein && (
        <ReferencePicker
          kind="structure"
          value={protein}
          onChange={selectProtein}
          language={language}
          label={zh ? "1. 选择 PDB 受体" : "1. Choose PDB receptor"}
        />
      )}
      {needsMolecule && (
        <ReferencePicker
          kind="ligand"
          value={molecule}
          onChange={selectMolecule}
          language={language}
          label={
            zh
              ? "选择与受体对齐的三维 SDF 分子"
              : "Choose a 3D SDF molecule aligned with the receptor"
          }
        />
      )}
      {collectionMode && (
        <>
          <ReferencePicker
            kind="ligand"
            value={molecule}
            onChange={selectMolecule}
            language={language}
            label={zh ? "添加分子候选" : "Add molecular candidates"}
          />
          <button
            type="button"
            disabled={
              !molecule ||
              collection.length >= 100 ||
              collection.some(
                (ref) => referenceKey(ref) === referenceKey(molecule),
              )
            }
            onClick={() => {
              if (molecule) setCollection([...collection, molecule]);
            }}
          >
            {zh ? "加入候选集合" : "Add to collection"}
          </button>
          <ul>
            {collection.map((ref, i) => (
              <li key={referenceKey(ref)}>
                {zh ? "分子" : "Molecule"} {i + 1} · {zh ? "记录" : "Record"}{" "}
                {ref.record + 1}{" "}
                <button
                  type="button"
                  onClick={() =>
                    setCollection(collection.filter((_, n) => n !== i))
                  }
                >
                  {zh ? "移除" : "Remove"}
                </button>
              </li>
            ))}
          </ul>
        </>
      )}
    </>
  );
}
export function DiffSettingQuestions({
  mode,
  language,
  expert,
  setExpert,
  options,
  setOptions,
  name,
  setName,
}: {
  mode: DiffMode;
  language: Language;
  expert: boolean;
  setExpert(value: boolean): void;
  options: Record<string, unknown>;
  setOptions(value: Record<string, unknown>): void;
  name: string;
  setName(value: string): void;
}) {
  const zh = language === "zh";
  return (
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
      {isDesign(mode) && (
        <DesignOptions
          mode={mode}
          value={options}
          onChange={setOptions}
          expert={expert}
          language={language}
        />
      )}
      <label className="field">
        {zh ? "任务名称（可选）" : "Task name (optional)"}
        <input
          value={name}
          maxLength={80}
          onChange={(e) => setName(e.target.value)}
        />
      </label>
    </>
  );
}
