import { useState } from "react";
import { request } from "../api";
import type { Language } from "../types";
import type { MoleculeRef, ScientificObject } from "../research/types";
import type { Observation } from "./types";
export function EvidenceLinks({
  rows,
  links,
  onChange,
  language,
}: {
  rows: Observation[];
  links: Record<string, MoleculeRef>;
  onChange(links: Record<string, MoleculeRef>): void;
  language: Language;
}) {
  const zh = language === "zh",
    compounds = [...new Set(rows.map((r) => r.compound))];
  const [compound, setCompound] = useState(compounds[0] ?? ""),
    [objects, setObjects] = useState<ScientificObject[]>([]),
    [error, setError] = useState(""),
    [loading, setLoading] = useState(false);
  async function load() {
    setError("");
    setLoading(true);
    try {
      const all: ScientificObject[] = [];
      let complete = false;
      for (let offset = 0; offset < 10000; offset += 200) {
        const page = await request<ScientificObject[]>(
          `/research/objects?limit=200&offset=${offset}`,
        );
        all.push(...page);
        if (page.length < 200) {
          complete = true;
          break;
        }
      }
      if (!complete)
        throw Error(
          zh
            ? "历史文件较多，请先在研究空间缩小范围。"
            : "Too many historical versions; narrow the research scope first.",
        );
      setObjects(
        all.filter((o) =>
          ["molecule", "sequence", "structure"].includes(o.kind),
        ),
      );
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }
  return (
    <details>
      <summary>
        {zh
          ? "关联已有分子、序列或结构（可选）"
          : "Link an existing molecule, sequence or structure (optional)"}{" "}
        · {Object.keys(links).length}
      </summary>
      <div className="evidence-link-row">
        <label className="field">
          {zh ? "表格中的材料" : "Material in this table"}
          <select
            value={compound}
            onChange={(e) => setCompound(e.target.value)}
          >
            {compounds.map((c) => (
              <option key={c}>{c}</option>
            ))}
          </select>
        </label>
        <label className="field">
          {zh ? "历史研究文件" : "Historical research file"}
          <select
            onFocus={() => {
              if (!objects.length && !loading) void load();
            }}
            value={links[compound]?.version_id ?? ""}
            onChange={(e) => {
              const next = { ...links },
                selected = objects.find((o) => o.id === e.target.value);
              if (selected) next[compound] = selected.reference;
              else delete next[compound];
              onChange(next);
            }}
          >
            <option value="">
              {loading
                ? zh
                  ? "正在读取…"
                  : "Loading…"
                : zh
                  ? "不关联"
                  : "Unlinked"}
            </option>
            {links[compound] &&
              !objects.some((o) => o.id === links[compound].version_id) && (
                <option value={links[compound].version_id!}>
                  {zh ? "已关联的确切版本" : "Linked exact version"}
                </option>
              )}
            {objects.map((o) => (
              <option key={o.id} value={o.id}>
                {o.label} · {o.reference.record + 1}
              </option>
            ))}
          </select>
        </label>
      </div>
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
    </details>
  );
}
