import { ChoiceCards } from "../guided/ChoiceCards";
import { useEffect, useRef, useState } from "react";
import { HistoricalFileSelect } from "../research/HistoricalFileSelect";
import { AssetPicker } from "../operations/AssetPicker";
import type { MoleculeRef } from "../research/types";
import type { Language } from "../types";
import { useReferenceHistory } from "./useReferenceHistory";
import { useReferenceSelection } from "./useReferenceSelection";

export function ReferencePicker({
  kind,
  value,
  onChange,
  language,
  label,
  allowedSuffixes,
}: {
  kind: "structure" | "ligand";
  value: MoleculeRef | null;
  onChange(ref: MoleculeRef | null): void;
  language: Language;
  label: string;
  allowedSuffixes?: readonly string[];
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
  const history = useReferenceHistory(kind, formats, source === "saved");
  const selection = useReferenceSelection(kind, formats, (reference) => {
    selections.current[source] = reference;
    onChange(reference);
  });
  function changeSource(next: "saved" | "file") {
    selection.cancel();
    setSource(next);
    onChange(selections.current[next]);
  }
  function chooseHistorical(id: string, reference?: MoleculeRef) {
    const file = history.files.find((asset) => asset.id === id);
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
        <HistoricalFileSelect
          language={language}
          label={label}
          value={value}
          versions={history.versions}
          files={history.files}
          busy={history.loading || selection.loading}
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
          value={value?.asset_id ?? ""}
          onChange={(id) => void selection.choose(id)}
          language={language}
          label={label}
        />
      </div>
      {kind === "ligand" && value && !value.version_id && (
        <label className="field">
          {zh
            ? "SDF 中第几个分子（从 1 开始）"
            : "Molecule record in SDF (starts at 1)"}
          <input
            type="number"
            min={1}
            max={500}
            value={value.record + 1}
            onChange={(e) =>
              onChange({ ...value, record: Number(e.target.value) - 1 })
            }
          />
        </label>
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
