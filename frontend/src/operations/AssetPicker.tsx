import { useEffect, useRef, useState } from "react";
import type { Language } from "../types";
import type { Asset, AssetKind } from "./types";
import { ArtifactPicker } from "./ArtifactPicker";
import { MaterialInput } from "../research/MaterialInput";
import { useReferenceHistory } from "../diffsbdd/useReferenceHistory";
import { AssetHistorySelect } from "./AssetHistorySelect";
import { useSelectedAsset } from "./useSelectedAsset";
import { assetFormats } from "./asset-acceptance";
import { useAssetSources, type AssetSource } from "./AssetPickerSources";
import { AssetPickerUpload } from "./AssetPickerUpload";

type Props = {
  kind: AssetKind;
  value: string;
  onChange(id: string): void;
  onSelectedAsset?(asset: Asset | null): void;
  language: Language;
  label: string;
  allowedSuffixes?: readonly string[];
  showHistory?: boolean;
  maxBytes?: number;
};

export function AssetPicker(props: Props) {
  const formats = props.allowedSuffixes ?? assetFormats[props.kind];
  const maxBytes = props.maxBytes ?? 25 * 1024 ** 2;
  const showHistory = props.showHistory ?? true;
  // A changed type/format/limit is a different input context, including pending work.
  return (
    <AssetPickerBody
      {...props}
      formats={formats}
      maxBytes={maxBytes}
      showHistory={showHistory}
      key={[props.kind, formats.join(","), maxBytes, showHistory].join(":")}
    />
  );
}

function AssetPickerBody({
  kind,
  value,
  onChange,
  onSelectedAsset,
  language,
  label,
  formats,
  showHistory,
  maxBytes,
}: Props & {
  formats: readonly string[];
  showHistory: boolean;
  maxBytes: number;
}) {
  const zh = language === "zh";
  const sources = useAssetSources(value, showHistory, onChange);
  const { source } = sources;
  const [knownBySource, setKnownBySource] = useState<
    Partial<Record<AssetSource, Asset>>
  >({});
  const [editingResult, setEditingResult] = useState(false);
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
    showHistory && source === "saved",
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
    (knownBySource[source]?.id === value ? knownBySource[source] : null) ??
    (history.selected?.asset.id === value ? history.selected.asset : null) ??
    history.files.find((file) => file.id === value) ??
    null;
  const selected = useSelectedAsset(value, kind, formats, maxBytes, known);
  const callback = useRef(onSelectedAsset);
  callback.current = onSelectedAsset;
  useEffect(() => {
    callback.current?.(selected.asset);
  }, [selected.asset]);
  function rememberAsset(asset: Asset) {
    setKnownBySource((previous) => ({ ...previous, [source]: asset }));
  }
  const content = (
    <>
      {(!showHistory || source === "file") && (
        <AssetPickerUpload
          kind={kind}
          formats={formats}
          maxBytes={maxBytes}
          value={value}
          onChange={sources.choose}
          onAsset={rememberAsset}
          language={language}
          label={label}
        />
      )}
      {showHistory && source === "saved" && (
        <>
          <AssetHistorySelect
            language={language}
            label={label}
            value={value}
            data={history.data}
            selected={selected.asset}
            loading={history.loading}
            query={query}
            page={page}
            onQuery={setQuery}
            onPage={setPage}
            onSelect={(asset) => {
              if (asset) rememberAsset(asset);
              sources.choose(asset?.id ?? "");
            }}
          />
          {history.loading && (
            <p role="status">
              {zh ? "正在读取历史文件…" : "Loading historical files…"}
            </p>
          )}
          {history.error && (
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
        </>
      )}
      {showHistory && source === "results" && (
        <>
          {!value || editingResult ? (
            <ArtifactPicker
              kind={kind}
              accept={formats.join(",")}
              language={language}
              maxBytes={maxBytes}
              currentInput={value}
              onPending={() => sources.choose("")}
              onSelected={(asset) => {
                rememberAsset(asset);
                sources.choose(asset.id);
                setEditingResult(false);
              }}
            />
          ) : (
            <button
              type="button"
              className="secondary-button"
              onClick={() => setEditingResult(true)}
            >
              {zh ? "选择其他任务结果" : "Choose another task result"}
            </button>
          )}
        </>
      )}
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
    </>
  );
  return (
    <div className="asset-picker">
      {showHistory ? (
        <MaterialInput
          kind={kind}
          label={label}
          source={source}
          onSource={(next) => {
            setEditingResult(false);
            sources.changeSource(next);
          }}
          options={[
            { value: "file", title: zh ? "上传新文件" : "Upload a new file" },
            { value: "saved", title: zh ? "历史文件" : "Historical files" },
            {
              value: "results",
              title: zh ? "任务结果文件" : "Task result files",
            },
          ]}
        >
          {content}
        </MaterialInput>
      ) : (
        content
      )}
    </div>
  );
}
