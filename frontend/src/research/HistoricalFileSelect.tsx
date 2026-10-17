import { historyChoiceLabel, nameCounts } from "../presentation/history-choice";
import type { Asset } from "../operations/types";
import type { Language } from "../types";
import type { MoleculeRef, ScientificObject } from "./types";
import type { InputSourceTask } from "./input-catalog";

/** One historical selector for exact research versions and unregistered uploads. */
export function HistoricalFileSelect({
  language,
  label,
  value,
  versions,
  files,
  busy,
  onSelect,
  requestedChoice = "",
  selectedFile,
  selectedVersion,
  compact = false,
  sourceTasks = {},
}: {
  language: Language;
  label: string;
  value: MoleculeRef | null;
  versions: ScientificObject[];
  files: Asset[];
  busy: boolean;
  onSelect(assetId: string, reference?: MoleculeRef): void;
  requestedChoice?: string;
  selectedFile?: Asset;
  selectedVersion?: ScientificObject;
  compact?: boolean;
  sourceTasks?: Record<string, InputSourceTask>;
}) {
  const zh = language === "zh";
  const versionNames = nameCounts(versions.map((v) => v.label));
  const fileNames = nameCounts(files.map((v) => v.name));
  // A file collection and an immutable record are distinct usable inputs.
  const uploads = files;
  const withSource = (version: ScientificObject, caption: string) =>
    sourceTasks[version.id]?.name
      ? `${sourceTasks[version.id].name} — ${caption}`
      : caption;
  const selected =
    requestedChoice ||
    (value?.version_id
      ? "version:" + value.version_id
      : value
        ? "file:" + value.asset_id
        : "");
  return (
    <label className="field">
      <span className={compact ? "sr-only" : undefined}>
        {label} · {zh ? "历史文件" : "Historical files"}
      </span>
      <select
        value={selected}
        disabled={busy}
        onChange={(e) => {
          const key = e.target.value;
          const version =
            versions.find((v) => "version:" + v.id === key) ??
            (selectedVersion && "version:" + selectedVersion.id === key
              ? selectedVersion
              : undefined);
          if (version) onSelect(version.reference.asset_id, version.reference);
          else
            onSelect(
              (
                uploads.find((f) => "file:" + f.id === key) ??
                (selectedFile && "file:" + selectedFile.id === key
                  ? selectedFile
                  : undefined)
              )?.id ?? "",
            );
        }}
      >
        <option value="">
          {zh ? "选择历史文件" : "Choose a historical file"}
        </option>
        <optgroup label={zh ? "研究结果" : "Research results"}>
          {versions.map((v, index) => (
            <option key={v.id} value={"version:" + v.id}>
              {withSource(
                v,
                (versionNames.get(v.label) ?? 0) > 1
                  ? historyChoiceLabel(v.label, index, zh, v.created_at)
                  : v.label,
              )}
              {v.kind === "molecule"
                ? ` · ${zh ? "记录" : "record"} ${v.reference.record + 1}`
                : ""}
            </option>
          ))}
        </optgroup>
        <optgroup label={zh ? "原始文件" : "Original files"}>
          {uploads.map((f, index) => (
            <option key={f.id} value={"file:" + f.id}>
              {(fileNames.get(f.name) ?? 0) > 1
                ? historyChoiceLabel(f.name, index, zh, f.created_at)
                : f.name}
            </option>
          ))}
        </optgroup>
        {selected &&
          !versions.some((v) => "version:" + v.id === selected) &&
          !uploads.some((f) => "file:" + f.id === selected) && (
            <option value={selected}>
              {zh ? "当前选择：" : "Current selection: "}
              {(selectedVersion
                ? withSource(selectedVersion, selectedVersion.label)
                : undefined) ??
                selectedFile?.name ??
                (zh ? "已选择的文件" : "Selected file")}
              {selectedVersion?.kind === "molecule"
                ? ` · ${zh ? "记录" : "record"} ${selectedVersion.reference.record + 1}`
                : ""}
            </option>
          )}
      </select>
    </label>
  );
}
