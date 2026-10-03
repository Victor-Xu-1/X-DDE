import { useEffect, useState } from "react";
import { api, request } from "../api";
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
  allowedSuffixes,
}: {
  kind: AssetKind;
  value: string;
  onChange(id: string): void;
  language: Language;
  label: string;
  allowedSuffixes?: readonly string[];
}) {
  const zh = language === "zh",
    [assets, setAssets] = useState<Asset[]>([]),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [opened, setOpened] = useState(false);
  const accepted = allowedSuffixes?.join(",") ?? accept[kind];
  const [showResults, setShowResults] = useState(false);
  useEffect(() => {
    if (!value && !opened) return;
    const c = new AbortController();
    void api
      .assets(c.signal)
      .then(async (values) => {
        if (value && !values.some((asset) => asset.id === value)) {
          const selected = await request<Asset>(`/assets/${value}/metadata`, {
            signal: c.signal,
          });
          values = [selected, ...values];
        }
        if (!c.signal.aborted) setAssets(values);
      })
      .catch((e) => {
        if (!c.signal.aborted) setError(String(e));
      });
    return () => c.abort();
  }, [value, opened]);
  return (
    <div className="asset-picker">
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
          accept={accepted}
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
      <small>{accepted} · ≤25 MiB</small>
      <details
        className="historical-files"
        open={Boolean(value) || opened}
        onToggle={(event) => setOpened(event.currentTarget.open)}
      >
        <summary>{zh ? "历史文件" : "Historical files"}</summary>
        <label className="field">
          {label}
          <select
            value={value}
            onChange={(e) => onChange(e.target.value)}
            disabled={busy}
            onFocus={() => setOpened(true)}
          >
            <option value="">
              {zh ? "选择历史文件" : "Choose a historical file"}
            </option>
            {assets
              .filter(
                (a) =>
                  a.kind === kind &&
                  (!allowedSuffixes || allowedSuffixes.includes(a.suffix)),
              )
              .map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                  {assets.filter(
                    (other) => other.kind === kind && other.name === a.name,
                  ).length > 1
                    ? ` · ${a.id.slice(0, 8)}`
                    : ""}
                </option>
              ))}
            {value && !assets.some((a) => a.id === value) && (
              <option value={value}>{value}</option>
            )}
          </select>
        </label>
        <button type="button" onClick={() => setShowResults((v) => !v)}>
          {zh ? "从已有任务结果中选择" : "Choose from task results"}
        </button>
        {showResults && (
          <ArtifactPicker
            kind={kind}
            accept={accepted}
            language={language}
            onSelected={(asset) => {
              setAssets((prev) => [asset, ...prev]);
              onChange(asset.id);
              setShowResults(false);
            }}
          />
        )}
      </details>
      {error && (
        <p role="alert" className="error-box">
          {error}
        </p>
      )}
    </div>
  );
}
