import { useEffect, useState } from "react";
import { AssetPicker } from "../operations/AssetPicker";
import { HistoricalFileSelect } from "./HistoricalFileSelect";
import { ChoiceCards } from "../guided/ChoiceCards";
import type { Language } from "../types";
import type { MoleculeRef } from "./types";
import { useReferenceHistory } from "../diffsbdd/useReferenceHistory";
import { useReferenceSelection } from "../diffsbdd/useReferenceSelection";
import { HistoryFileControls } from "./HistoryFileControls";
import { inputChoiceKey } from "./input-catalog";
import { useSequenceSave } from "./useSequenceSave";

export function SequencePicker({
  language,
  value,
  onChange,
  label,
  filename = "sequence-input.fasta",
}: {
  language: Language;
  value: MoleculeRef | null;
  onChange(value: MoleculeRef | null): void;
  label: string;
  filename?: string;
}) {
  const zh = language === "zh",
    [source, setSource] = useState<"saved" | "file" | "paste">(
      value?.version_id ? "saved" : value ? "file" : "paste",
    );
  const [text, setText] = useState(""),
    [query, setQuery] = useState(""),
    [search, setSearch] = useState(""),
    [page, setPage] = useState(0);
  useEffect(() => {
    const timer = setTimeout(() => {
      setSearch(query);
      setPage(0);
    }, 250);
    return () => clearTimeout(timer);
  }, [query]);
  const selection = useReferenceSelection(
    "sequences",
    [".fa", ".fasta"],
    onChange,
  );
  const saved = useSequenceSave(onChange);
  const history = useReferenceHistory(
    "sequences",
    [".fa", ".fasta"],
    source === "saved",
    {
      query: search,
      page,
      selected: selection.requestedChoice || inputChoiceKey(value),
      wholeFile: false,
    },
  );
  useEffect(() => {
    if (history.data && page > 0 && page * 25 >= history.data.total)
      setPage(Math.max(0, Math.ceil(history.data.total / 25) - 1));
  }, [history.data, page]);
  function choose(id: string, reference?: MoleculeRef) {
    const file =
      history.files.find((file) => file.id === id) ??
      (history.selected?.asset.id === id ? history.selected.asset : undefined);
    void selection.choose(
      id,
      reference ??
        (file
          ? {
              asset_id: file.id,
              sha256: file.sha256,
              record: 0,
              conformer: 0,
              version_id: null,
            }
          : undefined),
    );
  }
  const busy = saved.busy || selection.loading;
  return (
    <section className="diff-reference">
      <h3 className="input-purpose">{label}</h3>
      <ChoiceCards<"saved" | "file" | "paste">
        label={label}
        value={source}
        onChange={(mode) => {
          selection.cancel();
          saved.detach();
          setSource(mode);
          setText("");
          onChange(null);
        }}
        options={[
          { value: "paste", title: zh ? "粘贴序列" : "Paste sequences" },
          {
            value: "file",
            title: zh ? "上传 FASTA 文件" : "Upload FASTA file",
          },
          { value: "saved", title: zh ? "历史文件" : "Historical files" },
        ]}
      />
      {source === "paste" && (
        <>
          <label className="field">
            {zh ? "序列或 FASTA" : "Sequence or FASTA"}
            <textarea
              rows={6}
              value={text}
              maxLength={2 * 1024 ** 2}
              disabled={busy}
              onChange={(event) => {
                saved.detach();
                setText(event.target.value);
                onChange(null);
              }}
              placeholder={
                zh
                  ? "粘贴一条序列；多条序列使用不同的 FASTA 标题。"
                  : "Paste one sequence; use distinct FASTA headers for multiple sequences."
              }
            />
          </label>
          <button
            type="button"
            disabled={busy || !text.trim() || Boolean(value)}
            onClick={() => void saved.save(text, filename)}
          >
            {busy
              ? zh
                ? "正在保存…"
                : "Saving…"
              : zh
                ? "确认序列"
                : "Confirm sequences"}
          </button>
          {value && (
            <p role="status">
              {zh
                ? "序列已保存，可进入下一步。"
                : "Sequence saved; continue to the next step."}
            </p>
          )}
          {saved.error && (
            <p role="alert">
              {saved.error === "size"
                ? zh
                  ? "序列输入不能超过 2 MiB。"
                  : "Sequence input must not exceed 2 MiB."
                : saved.error === "identity"
                  ? zh
                    ? "保存回复与当前序列不一致，请重新确认。"
                    : "The save response does not match the current sequence. Confirm it again."
                  : zh
                    ? "未能确认序列是否保存，重试会保留同一个保存请求。"
                    : "Sequence saving could not be confirmed. Retry keeps the same save request."}
            </p>
          )}
        </>
      )}
      {source === "saved" && (
        <>
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
            value={value}
            versions={history.versions}
            files={history.files}
            busy={busy || history.loading}
            requestedChoice={selection.requestedChoice}
            selectedFile={history.selected?.asset}
            selectedVersion={history.selected?.version ?? undefined}
            onSelect={choose}
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
      {source === "file" && (
        <AssetPicker
          showHistory={false}
          language={language}
          label={label}
          kind="sequences"
          maxBytes={2 * 1024 ** 2}
          allowedSuffixes={[".fa", ".fasta"]}
          value={value?.asset_id ?? ""}
          onChange={(id) => void selection.choose(id)}
        />
      )}
      {selection.loading && (
        <p role="status">
          {zh ? "正在核对所选序列…" : "Checking the selected sequences…"}
        </p>
      )}
      {selection.error && (
        <div className="error-box">
          <p role="alert">
            {selection.error === "identity"
              ? zh
                ? "文件详情与所选序列记录不一致，请选择原始文件。"
                : "File details do not match the selected sequence record. Choose the original file."
              : zh
                ? "所选序列文件暂时无法核对，请重试或选择支持的 FASTA 文件。"
                : "The selected sequence file could not be verified. Retry or choose a supported FASTA file."}
          </p>
          {selection.error === "unavailable" && (
            <button
              type="button"
              className="secondary-button"
              onClick={selection.retry}
            >
              {zh ? "重新读取序列" : "Retry selected sequences"}
            </button>
          )}
        </div>
      )}
    </section>
  );
}
