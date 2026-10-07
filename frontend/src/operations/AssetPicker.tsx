import { useEffect, useState } from "react";
import { api, request } from "../api";
import type { Language } from "../types";
import type { Asset, AssetKind } from "./types";
import { ArtifactPicker } from "./ArtifactPicker";
import { FileSelect } from "../presentation/FileSelect";

const accept: Record<AssetKind, string> = {
  measurements: ".csv",
  structure: ".pdb,.cif",
  ligand: ".sdf,.mol,.mol2,.pdb",
  msa: ".a3m",
  template: ".a3m,.hhr",
  config: ".json,.yaml,.yml",
  sequences: ".fasta,.fa",
  library: ".sdf,.csv,.tsv,.smi,.smiles,.sdf.gz,.csv.gz,.tsv.gz",
  counts: ".csv,.tsv,.csv.gz,.tsv.gz",
  reads: ".fastq,.fq,.fastq.gz,.fq.gz",
};
export function AssetPicker({
  kind,
  value,
  onChange,
  language,
  label,
  allowedSuffixes,
  showHistory = true,
  maxBytes = 25 * 1024 ** 2,
}: {
  kind: AssetKind;
  value: string;
  onChange(id: string): void;
  language: Language;
  label: string;
  allowedSuffixes?: readonly string[];
  showHistory?: boolean;
  maxBytes?: number;
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
      {showHistory && <h3 className="input-purpose">{label}</h3>}
      <label className="file-upload">
        {busy
          ? zh
            ? "上传中…"
            : "Uploading…"
          : zh
            ? "上传文件"
            : "Upload file"}
        <FileSelect
          language={language}
          aria-label={(zh ? "上传 " : "Upload ") + label}
          accept={accepted}
          disabled={busy}
          onChange={async (e) => {
            const file = e.target.files?.[0];
            if (!file) return;
            if (file.size > maxBytes) {
              setError(
                zh
                  ? `文件不能超过 ${maxBytes / 1024 ** 2} MiB。`
                  : `Use a file up to ${maxBytes / 1024 ** 2} MiB.`,
              );
              return;
            }
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
      <small>
        {accepted} · ≤{maxBytes / 1024 ** 2} MiB
      </small>
      {!showHistory && value && (
        <p className="selected-file" role="status">
          {assets.find((a) => a.id === value)?.name ??
            (zh ? "已选择文件" : "File selected")}
        </p>
      )}
      {showHistory && (
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
                      ? ` · ${new Date(a.created_at).toLocaleString(zh ? "zh-CN" : "en-US")}`
                      : ""}
                  </option>
                ))}
              {value && !assets.some((a) => a.id === value) && (
                <option value={value}>
                  {zh ? "已选择的文件" : "Selected file"}
                </option>
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
      )}
      {error && (
        <p role="alert" className="error-box">
          {error}
        </p>
      )}
    </div>
  );
}
