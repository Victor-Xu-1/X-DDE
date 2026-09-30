import { useEffect, useRef, useState } from "react";
import { request } from "../api";
import { AssetPicker } from "../operations/AssetPicker";
import type { Asset } from "../operations/types";
import type { MoleculeRef, ScientificObject } from "../research/types";
import type { Language } from "../types";

export function ReferencePicker({
  kind,
  value,
  onChange,
  language,
  label,
  allowedSuffixes,
}: {
  kind: "structure" | "ligand";
  value: MoleculeRef | null;
  onChange(ref: MoleculeRef | null): void;
  language: Language;
  label: string;
  allowedSuffixes?: readonly string[];
}) {
  const zh = language === "zh",
    selectionIntent = useRef(0);
  const [versions, setVersions] = useState<ScientificObject[]>([]),
    [error, setError] = useState("");
  const formats =
    allowedSuffixes ?? (kind === "structure" ? [".pdb"] : [".sdf"]);
  const [loading, setLoading] = useState(false);
  useEffect(() => {
    const c = new AbortController();
    setLoading(true);
    async function load() {
      const all: ScientificObject[] = [];
      for (let offset = 0; offset < 10000; offset += 200) {
        const page = await request<ScientificObject[]>(
          `/research/objects?limit=200&offset=${offset}`,
          { signal: c.signal },
        );
        all.push(...page);
        if (page.length < 200) break;
      }
      if (!c.signal.aborted)
        setVersions(
          all.filter(
            (v) => v.kind === (kind === "structure" ? "structure" : "molecule"),
          ),
        );
    }
    void load()
      .catch((e) => {
        if (!c.signal.aborted) setError(String(e));
      })
      .finally(() => {
        if (!c.signal.aborted) setLoading(false);
      });
    return () => {
      selectionIntent.current++;
      c.abort();
    };
  }, [kind]);
  async function choose(id: string, reference?: MoleculeRef) {
    const intent = ++selectionIntent.current;
    setError("");
    if (!id) {
      setLoading(false);
      onChange(null);
      return;
    }
    setLoading(true);
    try {
      const asset = await request<Asset>(`/assets/${id}/metadata`);
      if (!formats.includes(asset.suffix))
        throw new Error(
          zh
            ? "此适配器需要 PDB 受体或 SDF 分子，请先明确转换格式。"
            : "This adapter requires PDB receptors or SDF molecules. Convert the format explicitly first.",
        );
      if (intent !== selectionIntent.current) return;
      onChange(
        reference ?? {
          asset_id: asset.id,
          sha256: asset.sha256,
          record: 0,
          conformer: 0,
          version_id: null,
        },
      );
    } catch (e) {
      if (intent === selectionIntent.current) {
        onChange(null);
        setError(String(e));
      }
    } finally {
      if (intent === selectionIntent.current) setLoading(false);
    }
  }
  return (
    <section className="diff-reference">
      <label className="field">
        {label} · {zh ? "复用研究资产" : "Reuse research asset"}
        <select
          value={value?.version_id ?? ""}
          disabled={loading}
          onChange={(e) => {
            const v = versions.find((v) => v.id === e.target.value);
            if (v) void choose(v.reference.asset_id, v.reference);
            else {
              selectionIntent.current++;
              onChange(null);
            }
          }}
        >
          <option value="">
            {zh
              ? "选择已保存版本，或在下方上传"
              : "Choose a saved version or upload below"}
          </option>
          {versions.map((v) => (
            <option key={v.id} value={v.id}>
              {v.label} · {v.id.slice(0, 8)} · {v.reference.record + 1}
            </option>
          ))}
        </select>
      </label>
      <AssetPicker
        kind={kind}
        allowedSuffixes={formats}
        value={value?.asset_id ?? ""}
        onChange={(id) => void choose(id)}
        language={language}
        label={label}
      />
      {kind === "ligand" && value && !value.version_id && (
        <label className="field">
          {zh
            ? "SDF 中第几个分子（从 1 开始）"
            : "Molecule record in SDF (starts at 1)"}
          <input
            type="number"
            min={1}
            max={500}
            value={value.record + 1}
            onChange={(e) =>
              onChange({ ...value, record: Number(e.target.value) - 1 })
            }
          />
        </label>
      )}
      {value && (
        <small title={`SHA256: ${value.sha256}`}>
          {zh
            ? "已绑定具体文件和记录；更改输入会清除旧选择。"
            : "Bound to the exact file and record. Changing input clears prior selections."}
        </small>
      )}
      {loading && <p role="status">{zh ? "读取资产…" : "Loading assets…"}</p>}
      {error && (
        <p role="alert" className="error-box">
          {error}
        </p>
      )}
    </section>
  );
}
