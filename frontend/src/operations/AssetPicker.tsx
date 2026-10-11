import { useEffect, useRef, useState } from "react";
import type { Language } from "../types";
import type { Asset, AssetKind } from "./types";
import { ArtifactPicker } from "./ArtifactPicker";
import { FileSelect } from "../presentation/FileSelect";
import { researchError } from "../presentation/research-content";
import { useReferenceHistory } from "../diffsbdd/useReferenceHistory";
import { AssetHistorySelect } from "./AssetHistorySelect";
import { useSelectedAsset } from "./useSelectedAsset";
import { useAssetUpload } from "./useAssetUpload";
import { assetFormats } from "./asset-acceptance";

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
    formats = allowedSuffixes ?? assetFormats[kind],
    accepted = formats.join(",");
  const [recent, setRecent] = useState<Asset | null>(null),
    [opened, setOpened] = useState(Boolean(value)),
    [showResults, setShowResults] = useState(false);
  const [query, setQuery] = useState(""),
    [search, setSearch] = useState(""),
    [page, setPage] = useState(0);
  useEffect(() => {
    if (query === search) return;
    const timer = setTimeout(() => {
      setSearch(query);
      setPage(0);
    }, 250);
    return () => clearTimeout(timer);
  }, [query, search]);
  const history = useReferenceHistory(
    kind,
    formats,
    showHistory && opened && !showResults,
    {
      query: search,
      page,
      selected: value ? "file:" + value : "",
      wholeFile: true,
    },
  );
  useEffect(() => {
    if (history.data && page > 0 && page * 25 >= history.data.total)
      setPage(Math.max(0, Math.ceil(history.data.total / 25) - 1));
  }, [history.data, page]);
  const known =
    (recent?.id === value ? recent : null) ??
    (history.selected?.asset.id === value ? history.selected.asset : null) ??
    history.files.find((file) => file.id === value) ??
    null;
  const selected = useSelectedAsset(value, kind, formats, maxBytes, known);
  const callback = useRef(onSelectedAsset);
  callback.current = onSelectedAsset;
  useEffect(() => {
    callback.current?.(selected.asset);
  }, [selected.asset]);
  const upload = useAssetUpload(
    kind,
    formats,
    maxBytes,
    value,
    onChange,
    setRecent,
  );
  const error =
    upload.error === "size"
      ? zh
        ? `文件必须非空且不能超过 ${maxBytes / 1024 ** 2} MiB。`
        : `Use a nonempty file up to ${maxBytes / 1024 ** 2} MiB.`
      : upload.error === "format"
        ? zh
          ? "请选择本任务支持的文件格式。"
          : "Choose a supported format for this task."
        : researchError(upload.error, zh);
  return (
    <div className="asset-picker">
      {showHistory && <h3 className="input-purpose">{label}</h3>}
      <label className="file-upload">
        {upload.busy && (
          <span role="status">{zh ? "上传中…" : "Uploading…"}</span>
        )}
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
          disabled={upload.busy}
          onChange={(event) => {
            const file = event.target.files?.[0];
            event.target.value = "";
            if (file) {
              setOpened(false);
              setShowResults(false);
              void upload.upload(file);
            }
          }}
        />
      </label>
      {value && (
        <p
          className="selected-file"
          role={!showHistory ? "status" : undefined}
          aria-live="polite"
        >
          {selected.asset?.name ?? (zh ? "正在核对文件…" : "Checking file…")}
        </p>
      )}
      {selected.error && (
        <div className="error-box">
          <p role="alert">
            {zh
              ? "所选文件暂时无法核对，请重试或选择原始文件。"
              : "The selected file could not be verified. Retry or choose the original file."}
          </p>
          <button
            type="button"
            className="secondary-button"
            onClick={selected.retry}
          >
            {zh ? "重新读取文件" : "Retry selected file"}
          </button>
        </div>
      )}
      {showHistory && (
        <details
          className="historical-files"
          open={opened}
          onToggle={(event) => {
            setOpened(event.currentTarget.open);
            if (!event.currentTarget.open) setShowResults(false);
          }}
        >
          <summary>{zh ? "历史文件" : "Historical files"}</summary>
          {!showResults && (
            <AssetHistorySelect
              language={language}
              label={label}
              value={value}
              data={history.data}
              selected={selected.asset}
              loading={upload.busy || history.loading}
              query={query}
              page={page}
              onQuery={setQuery}
              onPage={setPage}
              onSelect={(asset) => {
                setShowResults(false);
                setRecent(asset);
                upload.clearError();
                onChange(asset?.id ?? "");
              }}
            />
          )}
          {!showResults && history.loading && (
            <p role="status">
              {zh ? "正在读取历史文件…" : "Loading historical files…"}
            </p>
          )}
          {!showResults && history.error && (
            <div className="error-box">
              <p role="alert">
                {zh
                  ? "暂时无法读取历史文件，请重试。"
                  : "Historical files could not be loaded. Try again."}
              </p>
              <button
                type="button"
                className="secondary-button"
                onClick={history.retry}
              >
                {zh ? "重试历史文件" : "Retry historical files"}
              </button>
            </div>
          )}
          <button
            type="button"
            onClick={() => setShowResults((state) => !state)}
          >
            {showResults
              ? zh
                ? "返回历史文件"
                : "Back to historical files"
              : zh
                ? "从已有任务结果中选择"
                : "Choose from task results"}
          </button>
          {opened && showResults && (
            <ArtifactPicker
              kind={kind}
              accept={accepted}
              language={language}
              maxBytes={maxBytes}
              currentInput={value}
              onPending={() => onChange("")}
              onSelected={(asset) => {
                setRecent(asset);
                onChange(asset.id);
                setShowResults(false);
                setOpened(false);
              }}
            />
          )}
        </details>
      )}
      {upload.error && (
        <p role="alert" className="error-box">
          {error}
        </p>
      )}
    </div>
  );
}
