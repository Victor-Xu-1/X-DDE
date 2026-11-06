import { useEffect, useState } from "react";
import { AssetPicker } from "../operations/AssetPicker";
import { HistoricalFileSelect } from "./HistoricalFileSelect";
import { MaterialInput } from "./MaterialInput";
import { SequenceTextInput } from "./SequenceTextInput";
import { useSequenceSources } from "./useSequenceSources";
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
  const zh = language === "zh";
  const sources = useSequenceSources(value, onChange);
  const { source, text } = sources;
  const [query, setQuery] = useState(""),
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
    sources.remember,
  );
  const saved = useSequenceSave(sources.remember);
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
  const busy = selection.loading || (source === "paste" && saved.busy);
  return (
    <section className="diff-reference">
      <MaterialInput
        kind="sequences"
        label={label}
        source={source}
        onSource={(mode) => {
          selection.cancel();
          saved.detach();
          sources.changeSource(mode);
        }}
        options={[
          { value: "paste", title: zh ? "粘贴序列" : "Paste sequences" },
          {
            value: "file",
            title: zh ? "上传 FASTA 文件" : "Upload FASTA file",
          },
          { value: "saved", title: zh ? "历史文件" : "Historical files" },
        ]}
      >
        {source === "paste" && (
          <SequenceTextInput
            language={language}
            text={text}
            busy={busy}
            confirmed={Boolean(value)}
            error={saved.error}
            onText={(raw) => {
              saved.detach();
              sources.edit(raw);
            }}
            onConfirm={() => void saved.save(text, filename)}
          />
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
              sourceTasks={history.sourceTasks}
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
      </MaterialInput>
    </section>
  );
}
