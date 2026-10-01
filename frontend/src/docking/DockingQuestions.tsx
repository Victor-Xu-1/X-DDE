import { ReferencePicker } from "../diffsbdd/ReferencePicker";
import type { MoleculeRef } from "../research/types";
import type { Language } from "../types";
import type { DockingMode } from "./types";
import { SearchRegion } from "./SearchRegion";
import { BoxFields } from "./BoxFields";
export function DockingInputs({
  language,
  receptor,
  ligand,
  onReceptor,
  onLigand,
}: {
  language: Language;
  receptor: MoleculeRef | null;
  ligand: MoleculeRef | null;
  onReceptor(v: MoleculeRef | null): void;
  onLigand(v: MoleculeRef | null): void;
}) {
  const zh = language === "zh";
  return (
    <>
      <ReferencePicker
        kind="structure"
        label={zh ? "受体结构" : "Receptor structure"}
        value={receptor}
        language={language}
        onChange={onReceptor}
      />
      <ReferencePicker
        kind="ligand"
        label={zh ? "选择分子或已有姿势" : "Choose a molecule or existing pose"}
        value={ligand}
        language={language}
        onChange={onLigand}
      />
    </>
  );
}
export function DockingRegion({
  language,
  mode,
  receptor,
  kind,
  reference,
  center,
  size,
  confirmed,
  onKind,
  onReference,
  onCenter,
  onSize,
  onConfirmed,
}: {
  language: Language;
  mode: DockingMode;
  receptor: MoleculeRef | null;
  kind: "reference" | "box";
  reference: MoleculeRef | null;
  center: string[];
  size: string[];
  confirmed: boolean;
  onKind(v: "reference" | "box"): void;
  onReference(v: MoleculeRef | null): void;
  onCenter(v: string[]): void;
  onSize(v: string[]): void;
  onConfirmed(v: boolean): void;
}) {
  const zh = language === "zh";
  return (
    <>
      {mode === "dock" && (
        <SearchRegion
          receptor={receptor}
          language={language}
          kind={kind}
          onKind={onKind}
          reference={reference}
          onReference={onReference}
          center={center}
          onCenter={onCenter}
          size={size}
          onSize={onSize}
        />
      )}
      {mode !== "dock" && (
        <details className="input-summary">
          <summary>
            {zh ? "结果检查范围（可选）" : "Output-check bounds (optional)"}
          </summary>
          <p className="field-help">
            {zh
              ? "以当前受体版本为坐标参照；仅用于计算后的空间检查，不引导评分或最小化。"
              : "In the current receptor coordinates, for output verification only; it does not guide scoring or minimization."}
          </p>
          <BoxFields
            language={language}
            center={center}
            onCenter={onCenter}
            size={size}
            onSize={onSize}
          />
        </details>
      )}
      {(mode !== "dock" || kind === "reference") && (
        <label>
          <input
            type="checkbox"
            checked={confirmed}
            onChange={(event) => onConfirmed(event.target.checked)}
          />
          {zh
            ? "我确认参考配体/已有姿势位于所选受体的坐标系中"
            : "I confirm the reference/existing pose is in the selected receptor coordinate frame"}
        </label>
      )}
    </>
  );
}
