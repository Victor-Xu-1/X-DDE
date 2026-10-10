import { useEffect, useRef, useState } from "react";
import { api, request } from "../api";
import type { Language } from "../types";
import type { Asset, AssetKind } from "./types";
import { ArtifactPicker } from "./ArtifactPicker";
import { FileSelect } from "../presentation/FileSelect";
import { researchError } from "../presentation/research-content";

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
  onSelectedAsset,
  language,
  label,
  allowedSuffixes,
  showHistory = true,
  maxBytes = 25 * 1024 ** 2,
}: {
  kind: AssetKind;
  value: string;
  onChange(id: string): void;
  onSelectedAsset?(asset: Asset | null): void;
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
  const selectedAsset = assets.find((asset) => asset.id === value) ?? null;
  useEffect(() => {
    onSelectedAsset?.(selectedAsset);
  }, [selectedAsset, onSelectedAsset]);
  const [showResults, setShowResults] = useState(false);
  const mounted = useRef(true);
  const uploadIntent = useRef(0);
  useEffect(() => {
    mounted.current = true;
    setBusy(false);
    return () => {
      mounted.current = false;
      uploadIntent.current++;
    };
  }, [kind, accepted, maxBytes]);
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
        {busy && <span role="status">{zh ? "上传中…" : "Uploading…"}</span>}
        <FileSelect
          language={language}
          description={
            accepted.replaceAll(".", "").split(",").join(" · ").toUpperCase() +
            (zh ? " · 最大 " : " · Up to ") +
            maxBytes / 1024 ** 2 +
            " MiB"
          }
          aria-label={(zh ? "上传 " : "Upload ") + label}
          accept={accepted}
          disabled={busy}
          onChange={async (e) => {
            const file = e.target.files?.[0];
            if (!file) return;
            const intent = ++uploadIntent.current;
            // A new file is a new input intent, even when upload fails. Do not
            // leave a previous file eligible for submission or block same-file retry.
            e.target.value = "";
            onChange("");
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
              if (!mounted.current || intent !== uploadIntent.current) return;
              setAssets((prev) => [asset, ...prev]);
              onChange(asset.id);
            } catch (e) {
              if (mounted.current && intent === uploadIntent.current)
                setError(String(e));
            } finally {
              if (mounted.current && intent === uploadIntent.current)
                setBusy(false);
            }
          }}
        />
      </label>
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
          {researchError(error, zh)}
        </p>
      )}
    </div>
  );
}
