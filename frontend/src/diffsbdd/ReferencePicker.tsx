import { ChoiceCards } from "../guided/ChoiceCards";
import { useEffect, useRef, useState } from "react";
import { api, request } from "../api";
import { HistoricalFileSelect } from "../research/HistoricalFileSelect";
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
  const [files, setFiles] = useState<Asset[]>([]);
  const [versions, setVersions] = useState<ScientificObject[]>([]),
    [error, setError] = useState("");
  const formats =
    allowedSuffixes ?? (kind === "structure" ? [".pdb"] : [".sdf"]);
  const [loading, setLoading] = useState(false);
  const [source, setSource] = useState<"saved" | "file">(() =>
    value?.version_id ? "saved" : "file",
  );
  const selections = useRef<{
    saved: MoleculeRef | null;
    file: MoleculeRef | null;
  }>({
    saved: value?.version_id ? value : null,
    file: value && !value.version_id ? value : null,
  });
  useEffect(() => {
    if (value) selections.current[source] = value;
  }, [value]);
  function changeSource(next: "saved" | "file") {
    selectionIntent.current++;
    setSource(next);
    setLoading(false);
    setError("");
    onChange(selections.current[next]);
  }
  useEffect(() => {
    if (source !== "saved") return;
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
      const uploaded = await api.assets(c.signal);
      if (!c.signal.aborted) {
        setFiles(
          uploaded.filter((v) => v.kind === kind && formats.includes(v.suffix)),
        );
        setVersions(
          all.filter(
            (v) => v.kind === (kind === "structure" ? "structure" : "molecule"),
          ),
        );
      }
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
  }, [kind, source]);
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
            ? "请选择本任务支持的结构格式。受体使用 PDB，分子使用 SDF。"
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
      <h3 className="input-purpose">{label}</h3>
      <ChoiceCards<"saved" | "file">
        label={label}
        value={source}
        onChange={changeSource}
        options={[
          { value: "file", title: zh ? "上传新文件" : "Upload a new file" },
          { value: "saved", title: zh ? "历史文件" : "Historical files" },
        ]}
      />
      <div hidden={source !== "saved"}>
        <HistoricalFileSelect
          language={language}
          label={label}
          value={value}
          versions={versions}
          files={files}
          busy={loading}
          onSelect={(id, ref) => void choose(id, ref)}
        />
      </div>
      <div hidden={source !== "file"}>
        <AssetPicker
          showHistory={false}
          kind={kind}
          allowedSuffixes={formats}
          value={value?.asset_id ?? ""}
          onChange={(id) => void choose(id)}
          language={language}
          label={label}
        />
      </div>
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
      {loading && <p role="status">{zh ? "读取资产…" : "Loading assets…"}</p>}
      {error && (
        <p role="alert" className="error-box">
          {error}
        </p>
      )}
    </section>
  );
}
