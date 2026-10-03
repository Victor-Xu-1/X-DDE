import { Hint } from "../guided/Hint";
import type { Language } from "../types";
import type { ContactSummary, ContactLimit } from "./protocol";
export function InteractionControls({
  language,
  enabled,
  labels,
  limit,
  summary,
  onChange,
}: {
  language: Language;
  enabled: boolean;
  labels: boolean;
  limit: ContactLimit;
  summary: ContactSummary | null;
  onChange(value: {
    interactions?: boolean;
    labels?: boolean;
    contactLimit?: ContactLimit;
  }): void;
}) {
  const zh = language === "zh";
  return (
    <div className="pocket-overview">
      <div className="interaction-controls">
        <label className="checkbox-label">
          <input
            type="checkbox"
            checked={enabled}
            onChange={(e) => onChange({ interactions: e.target.checked })}
          />
          {zh ? "显示相互作用" : "Show interactions"}
        </label>
        <label>
          {zh ? "关注残基" : "Focus residues"}
          <select
            value={limit}
            onChange={(e) =>
              onChange({
                contactLimit:
                  e.target.value === "all"
                    ? "all"
                    : (Number(e.target.value) as 3 | 5),
              })
            }
          >
            <option value={3}>{zh ? "3 个" : "3 residues"}</option>
            <option value={5}>
              {zh ? "5 个 · 推荐" : "5 residues · default"}
            </option>
            <option value="all">{zh ? "全部" : "All"}</option>
          </select>
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
            ? "默认突出最近的 5 个接触残基，其他原子收起，骨架淡化。这是按重原子距离选择的观察列表，不是关键药效残基或作用强弱排名。虚线为 4 Å 内的几何近接；红色为小于 1.5 Å 的过近接触。‘全部’最多显示 60 个残基。氢键、疏水作用和逐残基作用能需要专门的化学分析。"
            : "The closest 5 contact residues are highlighted by default; other atom displays are hidden and the backbone is faint. This distance-based viewing list is not a pharmacological importance or strength ranking. Dashed lines show heavy-atom contacts within 4 Å; red indicates distances below 1.5 Å. All displays up to 60 residues. Chemical types and per-residue energies require separate analysis."}
        </Hint>
        {enabled && summary && (
          <span role="status" className="interaction-summary">
            {zh
              ? `显示 ${summary.shown} / ${summary.total} 个接触残基`
              : `Showing ${summary.shown} / ${summary.total} contact residues`}
          </span>
        )}
      </div>
      {enabled && summary && (
        <details className="contact-details">
          <summary>{zh ? "接触明细" : "Contact details"}</summary>
          {summary.residues.length ? (
            <table>
              <thead>
                <tr>
                  <th>{zh ? "残基" : "Residue"}</th>
                  <th>{zh ? "接触距离" : "Contact distance"}</th>
                </tr>
              </thead>
              <tbody>
                {summary.residues.map((r) => (
                  <tr key={r.label}>
                    <td>{r.label}</td>
                    <td>
                      {r.distance.toFixed(2)} Å{" "}
                      {r.tooClose ? (zh ? "· 过近" : "· Too close") : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <p>{zh ? "没有 4 Å 内的接触。" : "No contacts within 4 Å."}</p>
          )}
        </details>
      )}
    </div>
  );
}
