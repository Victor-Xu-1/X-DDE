import { useEffect, useState } from "react";
import { api } from "../api";
import type { Language } from "../types";
import type { Asset, AssetKind } from "./types";
import { ArtifactPicker } from "./ArtifactPicker";

const accept: Record<AssetKind, string> = {
  structure: ".pdb,.cif",
  ligand: ".sdf,.mol,.mol2,.pdb",
  msa: ".a3m",
  template: ".a3m,.hhr",
  config: ".json,.yaml,.yml",
  sequences: ".fasta,.fa",
};
export function AssetPicker({
  kind,
  value,
  onChange,
  language,
  label,
}: {
  kind: AssetKind;
  value: string;
  onChange(id: string): void;
  language: Language;
  label: string;
}) {
  const zh = language === "zh",
    [assets, setAssets] = useState<Asset[]>([]),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [opened, setOpened] = useState(false);
  const [showResults, setShowResults] = useState(false);
  useEffect(() => {
    if (!value && !opened) return;
    const c = new AbortController();
    void api
      .assets(c.signal)
      .then(setAssets)
      .catch((e) => {
        if (!c.signal.aborted) setError(String(e));
      });
    return () => c.abort();
  }, [Boolean(value), opened]);
  return (
    <div className="asset-picker">
      <label className="field">
        {label}
        <select
          value={value}
          onChange={(e) => onChange(e.target.value)}
          disabled={busy}
          onFocus={() => setOpened(true)}
        >
          <option value="">
            {zh ? "选择已上传文件" : "Choose uploaded file"}
          </option>
          {assets
            .filter((a) => a.kind === kind)
            .map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          {value && !assets.some((a) => a.id === value) && (
            <option value={value}>{value}</option>
          )}
        </select>
      </label>
      <label className="file-upload">
        {busy
          ? zh
            ? "上传中…"
            : "Uploading…"
          : zh
            ? "上传文件"
            : "Upload file"}
        <input
          type="file"
          accept={accept[kind]}
          disabled={busy}
          onChange={async (e) => {
            const file = e.target.files?.[0];
            if (!file) return;
            setBusy(true);
            setError("");
            try {
              const asset = await api.upload(file, kind);
              setAssets((prev) => [asset, ...prev]);
              onChange(asset.id);
            } catch (e) {
              setError(String(e));
            } finally {
              setBusy(false);
            }
          }}
        />
      </label>
      <small>{accept[kind]} · ≤25 MiB</small>
      <button type="button" onClick={() => setShowResults((v) => !v)}>
        {zh ? "从已有任务结果中选择" : "Choose from task results"}
      </button>
      {showResults && (
        <ArtifactPicker
          kind={kind}
          accept={accept[kind]}
          language={language}
          onSelected={(asset) => {
            setAssets((prev) => [asset, ...prev]);
            onChange(asset.id);
            setShowResults(false);
          }}
        />
      )}
      {error && (
        <p role="alert" className="error-box">
          {error}
        </p>
      )}
    </div>
  );
}
