import { useState } from "react";
import { StructureWorkbench } from "../presentation/StructureWorkbench";
import { RegionPreview } from "./RegionPreview";
import { PoseWorkspace } from "../poses/PoseWorkspace";
import type { Language } from "../types";
import type { DefinedSiteSet } from "./types";

export function DefinedSiteResults({
  value,
  language,
}: {
  value: DefinedSiteSet;
  language: Language;
}) {
  const zh = language === "zh";
  const [selected, setSelected] = useState(value.sites[0]?.id ?? "");
  const site = value.sites.find((s) => s.id === selected) ?? value.sites[0];
  if (!site) return null;
  const reference =
    site.search.kind === "reference_ligand" ? site.search.reference : null;
  return (
    <section
      className="site-results"
      aria-label={zh ? "指定搜索区域" : "Defined search regions"}
    >
      <StructureWorkbench
        preview={
          <RegionPreview
            language={language}
            receptor={site.protein}
            reference={reference}
            confirmed={true}
            box={site.search.kind === "box" ? site.search.box : undefined}
          />
        }
      >
        <label className="field">
          {zh ? "查看区域" : "View region"}
          <select value={site.id} onChange={(e) => setSelected(e.target.value)}>
            {value.sites.map((row) => (
              <option key={row.id} value={row.id}>
                {zh ? "受体" : "Receptor"} {row.member_index + 1} · {row.label}
              </option>
            ))}
          </select>
        </label>
        <h3>{site.label}</h3>
        <dl className="questionnaire-review">
          <dt>{zh ? "受体" : "Receptor"}</dt>
          <dd>{site.member_index + 1}</dd>
          <dt>{zh ? "搜索方式" : "Search method"}</dt>
          <dd>
            {reference
              ? zh
                ? "围绕参考配体"
                : "Around a reference ligand"
              : zh
                ? "受体坐标中的搜索盒"
                : "Box in receptor coordinates"}
          </dd>
          {site.search.kind === "box" && (
            <>
              <dt>{zh ? "中心（Å）" : "Center (Å)"}</dt>
              <dd>{site.search.box.center.join(", ")}</dd>
              <dt>{zh ? "边长（Å）" : "Lengths (Å)"}</dt>
              <dd>{site.search.box.size.join(" × ")}</dd>
            </>
          )}
        </dl>
        <p className="field-help">
          {zh
            ? "这些是保存的搜索条件，不是口袋预测结果或分子结合的证据。"
            : "These are saved search conditions, not pocket predictions or evidence of binding."}
        </p>
        <a
          className="secondary-button"
          href={`/api/assets/${site.protein.asset_id}`}
          download
        >
          {zh ? "下载对齐受体" : "Download aligned receptor"}
        </a>
        {reference && (
          <a
            className="secondary-button"
            href={`/api/assets/${reference.asset_id}`}
            download
          >
            {zh ? "下载原始参考配体" : "Download source reference ligand"}
          </a>
        )}
      </StructureWorkbench>
      <details>
        <summary>
          {zh ? "用这些区域探索结合姿势" : "Explore poses in these regions"}
        </summary>
        <PoseWorkspace language={language} initialSites={value} />
      </details>
    </section>
  );
}
