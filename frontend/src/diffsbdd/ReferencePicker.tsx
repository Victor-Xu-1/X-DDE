import { ChoiceCards } from "../guided/ChoiceCards";
import { useEffect, useRef, useState } from "react";
import { HistoricalFileSelect } from "../research/HistoricalFileSelect";
import { AssetPicker } from "../operations/AssetPicker";
import type { MoleculeRef } from "../research/types";
import type { Language } from "../types";
import { useReferenceHistory } from "./useReferenceHistory";
import { useReferenceSelection } from "./useReferenceSelection";
import { HistoryFileControls } from "../research/HistoryFileControls";
import { inputChoiceKey } from "../research/input-catalog";
import type { Asset } from "../operations/types";
import { SdfRecordPicker } from "../research/SdfRecordPicker";

export function ReferencePicker({
  kind,
  value,
  onChange,
  language,
  label,
  allowedSuffixes,
  wholeFile = false,
  onAssetVerified,
}: {
  kind: "structure" | "ligand";
  value: MoleculeRef | null;
  onChange(ref: MoleculeRef | null): void;
  language: Language;
  label: string;
  allowedSuffixes?: readonly string[];
  wholeFile?: boolean;
  onAssetVerified?(asset: Asset, reference: MoleculeRef): void;
}) {
  const zh = language === "zh";
  const formats =
    allowedSuffixes ?? (kind === "structure" ? [".pdb"] : [".sdf"]);
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
  const [query, setQuery] = useState(""),
    [search, setSearch] = useState(""),
    [page, setPage] = useState(0);
  const [invalidRecord, setInvalidRecord] = useState(false);
  const knownFormats = useRef(new Map<string, string>());
  useEffect(() => {
    const timer = setTimeout(() => {
      setSearch(query);
      setPage(0);
    }, 250);
    return () => clearTimeout(timer);
  }, [query]);
  const selection = useReferenceSelection(
    kind,
    formats,
    (reference) => {
      setInvalidRecord(false);
      selections.current[source] = reference;
      onChange(reference);
    },
    (asset, reference) => {
      knownFormats.current.set(asset.id + ":" + asset.sha256, asset.suffix);
      onAssetVerified?.(asset, reference);
    },
  );
  const recordBase =
    value ?? (invalidRecord ? selections.current[source] : null);
  const history = useReferenceHistory(kind, formats, source === "saved", {
    query: search,
    page,
    selected:
      selection.requestedChoice || inputChoiceKey(recordBase, wholeFile),
    wholeFile,
  });
  useEffect(() => {
    if (history.data && page > 0 && page * 25 >= history.data.total)
      setPage(Math.max(0, Math.ceil(history.data.total / 25) - 1));
  }, [history.data, page]);
  function changeSource(next: "saved" | "file") {
    setInvalidRecord(false);
    selection.cancel();
    setSource(next);
    onChange(selections.current[next]);
  }
  function chooseHistorical(id: string, reference?: MoleculeRef) {
    const file =
      history.files.find((asset) => asset.id === id) ??
      (history.selected?.asset.id === id ? history.selected.asset : undefined);
    const declared =
      reference ??
      (file
        ? {
            asset_id: file.id,
            sha256: file.sha256,
            record: 0,
            conformer: 0,
            version_id: null,
          }
        : undefined);
    void selection.choose(id, declared);
  }
  const error =
    selection.error === "identity"
      ? zh
        ? "文件详情与所选记录不一致，请重新选择原始文件。"
        : "File details do not match the selected record. Choose the original file again."
      : selection.error === "format"
        ? zh
          ? `请选择本任务支持的文件格式：${formats.join("、")}。`
          : `Choose a supported file format for this task: ${formats.join(", ")}.`
        : zh
          ? "暂时无法读取所选文件，请重试或选择其他文件。"
          : "The selected file could not be read. Try again or choose another file.";
  const recordFormat =
    recordBase &&
    (knownFormats.current.get(recordBase.asset_id + ":" + recordBase.sha256) ??
      (selection.asset?.id === recordBase.asset_id
        ? selection.asset.suffix
        : history.selected?.asset.id === recordBase.asset_id
          ? history.selected.asset.suffix
          : formats.length === 1
            ? formats[0]
            : null));
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
        <HistoryFileControls
          language={language}
          query={query}
          page={page}
          data={history.data}
          loading={history.loading}
          onQuery={setQuery}
          onPage={setPage}
        />
        <HistoricalFileSelect
          compact
          language={language}
          label={label}
          value={invalidRecord ? recordBase : value}
          versions={history.versions}
          files={history.files}
          busy={history.loading || selection.loading}
          requestedChoice={
            selection.requestedChoice ||
            (wholeFile ? inputChoiceKey(value, true) : "")
          }
          selectedFile={history.selected?.asset}
          selectedVersion={history.selected?.version ?? undefined}
          onSelect={chooseHistorical}
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
                ? "暂时无法读取历史文件列表，请重试。"
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
      </div>
      <div hidden={source !== "file"}>
        <AssetPicker
          showHistory={false}
          kind={kind}
          allowedSuffixes={formats}
          value={
            value?.asset_id ??
            (invalidRecord ? (recordBase?.asset_id ?? "") : "")
          }
          onChange={(id) => void selection.choose(id)}
          language={language}
          label={label}
        />
      </div>
      {kind === "ligand" &&
        !wholeFile &&
        recordBase &&
        !recordBase.version_id &&
        recordFormat === ".sdf" && (
          <SdfRecordPicker
            key={recordBase.asset_id + recordBase.sha256}
            base={recordBase}
            language={language}
            onChange={(reference) => {
              setInvalidRecord(!reference);
              onChange(reference);
            }}
          />
        )}
      {selection.loading && (
        <p role="status">
          {zh ? "正在核对所选文件…" : "Checking the selected file…"}
        </p>
      )}
      {selection.error && (
        <div className="error-box">
          <p role="alert">{error}</p>
          {selection.error === "unavailable" && (
            <button
              type="button"
              className="secondary-button"
              onClick={selection.retry}
            >
              {zh ? "重新读取文件" : "Retry selected file"}
            </button>
          )}
        </div>
      )}
    </section>
  );
}
