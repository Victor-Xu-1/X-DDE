import { BoxFields } from "../docking/BoxFields";
import { LigandChoice } from "../poses/LigandChoice";
import type { Language } from "../types";
import type { RegionDraft } from "./region-draft";

export function DefinedRegionEditor({
  value,
  onChange,
  language,
}: {
  value: RegionDraft;
  onChange(v: Partial<RegionDraft>): void;
  language: Language;
}) {
  const zh = language === "zh";
  return (
    <div className="defined-region-editor">
      <label className="field">
        {zh ? "区域名称" : "Region name"}
        <input
          maxLength={80}
          value={value.label}
          onChange={(e) => onChange({ label: e.target.value })}
        />
      </label>
      <label className="field">
        {zh ? "在哪里搜索？" : "Where should the search run?"}
        <select
          value={value.kind}
          onChange={(e) =>
            onChange({
              kind: e.target.value as RegionDraft["kind"],
              confirmed: false,
            })
          }
        >
          <option value="reference">
            {zh ? "围绕已有口袋配体" : "Around a known pocket ligand"}
          </option>
          <option value="box">
            {zh
              ? "指定受体坐标中的搜索盒"
              : "Define a box in receptor coordinates"}
          </option>
        </select>
      </label>
      {value.kind === "box" ? (
        <BoxFields
          language={language}
          center={value.center}
          size={value.size}
          onCenter={(center) => onChange({ center })}
          onSize={(size) => onChange({ size })}
        />
      ) : (
        <LigandChoice
          key={value.key}
          purpose="reference"
          index={0}
          states={[]}
          language={language}
          value={
            value.reference
              ? {
                  reference: value.reference,
                  state_set_id: null,
                  state_index: null,
                  conformer_index: null,
                }
              : null
          }
          onChange={(v) =>
            onChange({ reference: v?.reference ?? null, confirmed: false })
          }
        />
      )}
    </div>
  );
}
