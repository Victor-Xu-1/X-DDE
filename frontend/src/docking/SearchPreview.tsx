import { useState } from "react";
import type { Language } from "../types";
import type { MoleculeRef } from "../research/types";
import { StructureViewer } from "../viewer/StructureViewer";
export function SearchPreview({
  receptor,
  language,
  onCenter,
}: {
  receptor: MoleculeRef;
  language: Language;
  onCenter(v: string[]): void;
}) {
  const zh = language === "zh";
  const [point, setPoint] = useState<[number, number, number] | null>(null),
    [label, setLabel] = useState("");
  return (
    <details>
      <summary>
        {zh
          ? "在三维预览中点选搜索中心"
          : "Pick a search center in the 3D preview"}
      </summary>
      <StructureViewer
        urls={[`/api/assets/${receptor.asset_id}`]}
        language={language}
        selectionMode="atom"
        onAtomSelected={(selection) => {
          const coordinates = selection?.position;
          if (
            !coordinates ||
            coordinates.length !== 3 ||
            coordinates.some((v) => !Number.isFinite(v))
          ) {
            setPoint(null);
            setLabel("");
            return;
          }
          setPoint(coordinates);
          setLabel(`${selection.chain}:${selection.residue} ${selection.atom}`);
        }}
      />
      <button
        type="button"
        disabled={!point}
        onClick={() => {
          if (point) onCenter(point.map(String));
        }}
      >
        {zh ? "以所选原子为搜索中心" : "Use selected atom as search center"}
      </button>
      {point && (
        <small>
          {label} · {point.map((v) => v.toFixed(3)).join(", ")} Å
        </small>
      )}
      <p className="field-help">
        {zh
          ? "这里只设置所选受体中的搜索中心；搜索范围可调整，点击不代表找到了结合位点。"
          : "This selects a center in the exact receptor frame. Adjust the search size; a click does not establish a binding site."}
      </p>
    </details>
  );
}
