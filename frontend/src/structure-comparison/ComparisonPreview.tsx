import { useState } from "react";
import { artifactUrl } from "../api";
import type { Language } from "../types";
import { StructureViewer } from "../viewer/StructureViewer";
import type { DisplayResidue } from "../viewer/residue-region";
import { addressLabel, type Displacement } from "./types";

export function ComparisonPreview({
  jobId,
  language,
  selection,
  onClear,
  onUse,
}: {
  jobId: string;
  language: Language;
  selection: Displacement | null;
  onClear(): void;
  onUse?: () => void;
}) {
  const zh = language === "zh",
    [view, setView] = useState<"overlay" | "reference" | "moving">("overlay");
  const urls = (
    view === "overlay"
      ? ["reference-selected.cif", "moving-aligned.cif"]
      : [view === "reference" ? "reference-selected.cif" : "moving-aligned.cif"]
  ).map((name) => artifactUrl(jobId, name));
  const region: DisplayResidue[] = selection
    ? (["reference", "moving"] as const)
        .filter((side) => view === "overlay" || side === view)
        .map((side) => ({
          ...selection[side],
          model: view === "overlay" && side === "moving" ? 1 : 0,
          alternate_location: "",
        }))
    : [];
  return (
    <>
      <div className="comparison-preview-actions">
        {(["overlay", "reference", "moving"] as const).map((value) => (
          <button
            key={value}
            type="button"
            className="secondary-button"
            aria-pressed={view === value}
            onClick={() => setView(value)}
          >
            {
              {
                overlay: zh ? "已对齐叠合" : "Aligned overlay",
                reference: zh ? "参照" : "Reference",
                moving: zh ? "已对齐比较结构" : "Aligned comparison",
              }[value]
            }
          </button>
        ))}
      </div>
      <StructureViewer
        key={jobId + ":" + view}
        urls={urls}
        language={language}
        comparison={view === "overlay"}
        sourceSnapshot
        residueRegion={region}
      />
      <p className="field-help">
        {view === "overlay"
          ? zh
            ? "蓝色：参照；橙色：比较结构。两者使用已验证的同一坐标系。"
            : "Blue: reference; orange: comparison. Both use the verified reference coordinate frame."
          : zh
            ? "已选择结构的原生链配色。"
            : "Native chain colors for the selected structure."}
      </p>
      {selection && (
        <output className="field-help">
          {addressLabel(selection.reference)} → {addressLabel(selection.moving)}{" "}
          · {selection.displacement_angstrom.toFixed(3)} Å
          <button type="button" className="text-button" onClick={onClear}>
            {zh ? "清除选择" : "Clear selection"}
          </button>
        </output>
      )}
      {onUse && (
        <button type="button" className="secondary-button" onClick={onUse}>
          {zh
            ? "用已对齐结构寻找口袋"
            : "Find pockets on the aligned structure"}
        </button>
      )}
    </>
  );
}
