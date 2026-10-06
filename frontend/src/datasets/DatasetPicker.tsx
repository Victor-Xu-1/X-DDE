import { useEffect, useRef, useState } from "react";
import { api } from "../api";
import { Hint } from "../guided/Hint";
import type { Asset } from "../operations/types";
import type { Language } from "../types";
import {
  PublicLibraryFiles,
  type PublicLibraryFile,
} from "./PublicLibraryFiles";
import {
  cancelUpload,
  uploadDataset,
  type DataKind,
  type UploadState,
} from "./upload";

const formats = {
  library: ".sdf,.csv,.tsv,.smi,.smiles,.sdf.gz,.csv.gz,.tsv.gz",
  counts: ".csv,.tsv,.csv.gz,.tsv.gz",
  reads: ".fastq,.fq,.fastq.gz,.fq.gz",
};
const sizeLabel = (size: number) =>
  size >= 1024 ** 3
    ? `${(size / 1024 ** 3).toFixed(2)} GB`
    : `${(size / 1024 ** 2).toFixed(1)} MB`;
export function DatasetPicker({
  language,
  kind,
  value,
  onChange,
  label,
  onResource,
}: {
  language: Language;
  kind: DataKind;
  value: Asset | null;
  onChange(value: Asset | null): void;
  label: string;
  onResource?(value: PublicLibraryFile): void;
}) {
  const zh = language === "zh",
    [history, setHistory] = useState(false),
    [publicFiles, setPublicFiles] = useState(false),
    [assets, setAssets] = useState<Asset[]>([]),
    [file, setFile] = useState<File | null>(null),
    [state, setState] = useState<UploadState | null>(null),
    [busy, setBusy] = useState(false),
    [progress, setProgress] = useState(0),
    [error, setError] = useState("");
  const controller = useRef<AbortController | null>(null),
    key = useRef(crypto.randomUUID());
  useEffect(() => () => controller.current?.abort(), []);
  useEffect(() => {
    if (!history) return;
    const c = new AbortController();
    void api
      .assets(c.signal)
      .then((items) => setAssets(items.filter((asset) => asset.kind === kind)))
      .catch((e) => {
        if (!c.signal.aborted) setError(String(e));
      });
    return () => c.abort();
  }, [history, kind]);
  async function begin(selected: File, resume?: string) {
    controller.current = new AbortController();
    setBusy(true);
    setError("");
    onChange(null);
    try {
      const asset = await uploadDataset(selected, kind, {
        signal: controller.current.signal,
        key: key.current,
        resume,
        onState: setState,
        onProgress: (done, total) => setProgress(done / total),
      });
      onChange(asset);
      setFile(null);
      setState(null);
      setProgress(1);
    } catch (e) {
      if (!controller.current.signal.aborted)
        setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }
  async function discard() {
    if (state) {
      try {
        await cancelUpload(state.id);
        setState(null);
        setFile(null);
        setProgress(0);
      } catch (e) {
        setError(String(e));
      }
    }
  }
  return (
    <section className="dataset-file-input">
      <div className="dataset-field-heading">
        <label>{label}</label>
        <Hint label={zh ? "文件说明" : "File help"}>
          {zh
            ? "大文件分段上传，可暂停后继续；每一段都会核对内容。历史文件是可选项。"
            : "Large files upload in verified parts and can be paused/resumed. History is optional."}
        </Hint>
      </div>
      <div className="dataset-source-tabs" role="group" aria-label={label}>
        <button
          type="button"
          aria-pressed={!history && !publicFiles}
          disabled={busy}
          onClick={() => {
            setHistory(false);
            setPublicFiles(false);
            onChange(null);
          }}
        >
          {zh ? "上传新文件" : "New file"}
        </button>
        <button
          type="button"
          aria-pressed={history}
          disabled={busy}
          onClick={() => {
            setHistory(true);
            setPublicFiles(false);
            onChange(null);
          }}
        >
          {zh ? "历史文件" : "History"}
        </button>
        {kind === "library" && (
          <button
            type="button"
            aria-pressed={publicFiles}
            disabled={busy}
            onClick={() => {
              setPublicFiles(true);
              setHistory(false);
              onChange(null);
            }}
          >
            {zh ? "公开结构库" : "Public libraries"}
          </button>
        )}
      </div>
      {publicFiles ? (
        <PublicLibraryFiles
          language={language}
          onChange={(resource) => {
            onChange(resource?.asset ?? null);
            if (resource) onResource?.(resource);
          }}
        />
      ) : history ? (
        <select
          aria-label={label}
          value={value?.id ?? ""}
          onChange={(e) =>
            onChange(
              assets.find((asset) => asset.id === e.target.value) ?? null,
            )
          }
        >
          <option value="">
            {zh ? "选择历史文件" : "Choose a historical file"}
          </option>
          {assets.map((asset) => (
            <option key={asset.id} value={asset.id}>
              {asset.name} · {sizeLabel(asset.size)}
            </option>
          ))}
        </select>
      ) : (
        <>
          {!busy && !state && (
            <label className="dataset-dropzone">
              <span className="dataset-upload-symbol" aria-hidden>
                ↥
              </span>
              <strong>{zh ? "选择研究文件" : "Choose a research file"}</strong>
              <span>
                {formats[kind].replaceAll(".", "").split(",").join(" · ")}
              </span>
              <input
                type="file"
                accept={formats[kind]}
                aria-label={label}
                onChange={(e) => {
                  const selected = e.target.files?.[0];
                  if (!selected) return;
                  key.current = crypto.randomUUID();
                  setFile(selected);
                  setProgress(0);
                  void begin(selected);
                }}
              />
            </label>
          )}
          {(busy || state) && (
            <div className="dataset-upload-progress">
              <strong>{file?.name ?? state?.name}</strong>
              <progress value={progress} max={1} />
              <span>
                {Math.round(progress * 100)}% ·{" "}
                {busy
                  ? zh
                    ? "上传与检查中"
                    : "Uploading and checking"
                  : zh
                    ? "已暂停"
                    : "Paused"}
              </span>
              {busy ? (
                <button
                  type="button"
                  onClick={() => controller.current?.abort()}
                >
                  {zh ? "暂停" : "Pause"}
                </button>
              ) : (
                <>
                  {file ? (
                    <button
                      type="button"
                      onClick={() => void begin(file, state?.id)}
                    >
                      {zh ? "继续上传" : "Resume"}
                    </button>
                  ) : (
                    <input
                      type="file"
                      accept={formats[kind]}
                      aria-label={
                        zh
                          ? "重新选择同一文件继续"
                          : "Reselect the same file to resume"
                      }
                      onChange={(e) => {
                        const selected = e.target.files?.[0];
                        if (selected) {
                          setFile(selected);
                          void begin(selected, state?.id);
                        }
                      }}
                    />
                  )}
                  <button type="button" onClick={() => void discard()}>
                    {zh ? "重新选择" : "Start over"}
                  </button>
                </>
              )}
            </div>
          )}
        </>
      )}
      {value && (
        <div className="dataset-selected-file">
          <span>✓</span>
          <strong>{value.name}</strong>
          <span>{sizeLabel(value.size)}</span>
        </div>
      )}
      {error && (
        <p role="alert" className="error-box">
          {error}
        </p>
      )}
    </section>
  );
}
