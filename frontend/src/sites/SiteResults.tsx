import { useState } from "react";
import type { Language } from "../types";
import { Hint } from "../guided/Hint";
import { PoseWorkspace } from "../poses/PoseWorkspace";
import { PocketResults } from "../pockets/PocketResults";
import type { SiteSet } from "./types";
export function SiteResults({
  value,
  language,
}: {
  value: SiteSet;
  language: Language;
}) {
  const zh = language === "zh";
  const [selected, setSelected] = useState<string | null>(null);
  const site = value.sites.find((s) => s.id === selected);
  const observation = value.observations.find(
    (o) => o.member_index === site?.member_index,
  );
  const reasonLabels: Record<string, string> = {
    insufficient_mapping: zh
      ? "可对应残基不足，不能判断"
      : "Insufficient mapped residues to decide",
    different_prediction_settings: zh
      ? "预测参数或结构来源模式不同"
      : "Different prediction settings or source profiles",
    center_distance: zh
      ? "口袋中心距离超出所选范围"
      : "Pocket centers exceed the selected distance",
    residue_overlap: zh
      ? "可对应残基重叠低于所选阈值"
      : "Mapped residue overlap is below the selected threshold",
    shared_residue_count: zh ? "共有残基数不足" : "Too few shared residues",
  };
  const siteLabel = (id: string) => {
    const s = value.sites.find((row) => row.id === id);
    return s
      ? (zh ? "受体 " : "Receptor ") +
          (s.member_index + 1) +
          " · " +
          (zh ? "口袋 " : "Pocket ") +
          s.native.rank
      : id;
  };
  const labels = {
    associated: zh ? "有关联证据" : "Association evidence",
    ambiguous: zh ? "多对多或间接关联" : "Many-to-many or indirect",
    unmatched: zh
      ? "在已比较候选中未匹配"
      : "Unmatched among compared candidates",
    uncertain: zh ? "证据不足" : "Insufficient evidence",
  };
  return (
    <section
      className="site-results"
      aria-label={zh ? "跨构象位点结果" : "Cross-conformation site results"}
    >
      {!value.sites.length && (
        <p role="status">
          {zh
            ? "未返回候选口袋，不能据此判断口袋消失或靶点不可成药。"
            : "No candidate pockets; this does not establish disappearance or undruggability."}
        </p>
      )}
      {value.observations.map((o) => (
        <p className="field-help" key={o.member_index}>
          {zh ? "受体" : "Receptor"} {o.member_index + 1} · {o.method}{" "}
          {o.software_version} · {o.pockets.length}/{o.native_pocket_count}
          {o.truncated
            ? " · " +
              (zh
                ? "候选被截取，不能判断位点缺失"
                : "Truncated candidates; absence cannot be inferred")
            : ""}
          {!o.pockets.length
            ? " · " + (zh ? "未返回候选" : "No candidates returned")
            : ""}
        </p>
      ))}
      <p className="field-help">
        {zh
          ? "同组表示关联证据，不是位点相同的确证。未匹配不代表生物学消失；体积、可达性和隐蔽位点尚未计算。"
          : "Groups represent association evidence, not proven identity. Unmatched does not mean disappearance; volume, accessibility and cryptic sites are not computed."}
      </p>
      {value.groups.map((g) => (
        <section className="receptor-input" key={g.id}>
          <strong>{labels[g.status]}</strong>
          <div className="receptor-actions">
            {g.sites.map((id) => {
              const s = value.sites.find((row) => row.id === id)!;
              return (
                <button
                  className="secondary-button"
                  type="button"
                  key={id}
                  aria-pressed={id === selected}
                  onClick={() => setSelected(id)}
                >
                  {zh ? "受体" : "Receptor"} {s.member_index + 1} ·{" "}
                  {zh ? "口袋" : "Pocket"} {s.native.rank}
                  {" · "}
                  {zh ? "查看并复用" : "Inspect and reuse"}
                </button>
              );
            })}
          </div>
          {g.missing_observed_members.length > 0 && (
            <p className="field-help">
              {zh
                ? "此组未关联的已观察受体"
                : "Observed receptors outside this group"}
              : {g.missing_observed_members.map((i) => i + 1).join(", ")}
            </p>
          )}
        </section>
      ))}
      <details>
        <summary>
          {zh
            ? "用此位点集合探索多个结合姿势"
            : "Explore multiple poses from this site set"}
        </summary>
        <PoseWorkspace language={language} initialSites={value} />
      </details>
      <details>
        <summary>
          {zh ? "关联证据与阈值" : "Association evidence and thresholds"}
        </summary>
        <div
          className="site-table-wrap"
          tabIndex={0}
          role="region"
          aria-label={zh ? "位点关联证据表" : "Site association evidence table"}
        >
          <table>
            <thead>
              <tr>
                <th>{zh ? "位点对" : "Site pair"}</th>
                <th>{zh ? "中心距离 Å" : "Center distance Å"}</th>
                <th>{zh ? "共有残基" : "Shared residues"}</th>
                <th aria-label={zh ? "残基重叠率" : "Residue overlap"}>
                  {zh ? "残基重叠率" : "Residue overlap"}
                  <Hint label={zh ? "残基重叠率说明" : "Residue overlap help"}>
                    {zh
                      ? "两个口袋共有的已映射残基数，除以其已映射残基并集数；1 表示完全重叠，不代表亲和力。"
                      : "Shared mapped residues divided by their union; 1 means complete overlap, not affinity."}
                  </Hint>
                </th>
                <th>{zh ? "判断" : "Assessment"}</th>
              </tr>
            </thead>
            <tbody>
              {value.relations.map((r) => (
                <tr key={r.left + ":" + r.right}>
                  <td>
                    {siteLabel(r.left)} ↔ {siteLabel(r.right)}
                  </td>
                  <td>{r.center_distance.toFixed(2)}</td>
                  <td>{r.shared_residues}</td>
                  <td>{r.residue_jaccard.toFixed(3)}</td>
                  <td>
                    {r.status === "associated"
                      ? labels.associated
                      : r.status === "uncertain"
                        ? labels.uncertain
                        : zh
                          ? "未达到阈值"
                          : "Below thresholds"}
                    {r.reasons.length > 0 && (
                      <Hint label={zh ? "未关联原因" : "Why not associated"}>
                        {r.reasons
                          .map((reason) => reasonLabels[reason] ?? reason)
                          .join("; ")}
                      </Hint>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <pre>{JSON.stringify(value.request.options, null, 2)}</pre>
        {value.sites.map((s) => (
          <p key={s.id}>
            {s.id} · {zh ? "残基映射覆盖" : "Residue mapping coverage"}{" "}
            {(s.mapping_coverage * 100).toFixed(1)}%
          </p>
        ))}
      </details>
      {site && observation && (
        <PocketResults
          key={site.id}
          job={{ id: observation.source_job }}
          result={{
            operation: "pocket_search",
            complete: true,
            protein: observation.protein,
            pockets: observation.pockets,
            native_pocket_count: observation.native_pocket_count,
            truncated: observation.truncated,
            profile: observation.profile,
            software_version: observation.software_version,
            protein_artifact: observation.protein_artifact,
          }}
          initialRank={site.native.rank}
          language={language}
        />
      )}
    </section>
  );
}
