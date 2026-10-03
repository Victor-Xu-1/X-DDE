import { Hint } from "../guided/Hint";
import type { Language } from "../types";
import type { ContactSummary } from "./protocol";
export function InteractionControls({
  language,
  enabled,
  labels,
  summary,
  onChange,
}: {
  language: Language;
  enabled: boolean;
  labels: boolean;
  summary: ContactSummary | null;
  onChange(value: { interactions?: boolean; labels?: boolean }): void;
}) {
  const zh = language === "zh";
  return (
    <div className="interaction-controls">
      <label className="checkbox-label">
        <input
          type="checkbox"
          checked={enabled}
          onChange={(e) => onChange({ interactions: e.target.checked })}
        />
        {zh ? "显示相互作用" : "Show interactions"}
      </label>
      <label className="checkbox-label">
        <input
          type="checkbox"
          checked={labels}
          onChange={(e) => onChange({ labels: e.target.checked })}
        />
        {zh ? "残基与距离" : "Residues and distances"}
      </label>
      <Hint label={zh ? "相互作用显示说明" : "Interaction display help"}>
        {zh
          ? "虚线连接配体与残基的最近重原子，显示 4 Å 内的几何近接；每个残基保留一条，最多显示 12 条。红色表示小于 1.5 Å 的过近接触。不能仅凭这些距离判定氢键、疏水作用或亲和力；化学类型请使用相互作用分析模块。"
          : "Dashed lines connect the nearest heavy-atom pair for each residue within 4 Å; up to 12 are shown. Red marks distances below 1.5 Å. Geometry alone does not assign hydrogen bonds, hydrophobic interactions or affinity; use the interaction analysis module for chemical types."}
      </Hint>
      {enabled && summary && (
        <span role="status" className="interaction-summary">
          {zh
            ? `几何近接 · ${summary.cutoff} Å · ${summary.shown} / ${summary.total} 个残基`
            : `Geometric contacts · ${summary.cutoff} Å · ${summary.shown} / ${summary.total} residues`}
        </span>
      )}
    </div>
  );
}
