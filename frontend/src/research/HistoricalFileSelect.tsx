import type { Asset } from "../operations/types";
import type { Language } from "../types";
import type { MoleculeRef, ScientificObject } from "./types";

/** One historical selector for exact research versions and unregistered uploads. */
export function HistoricalFileSelect({
  language,
  label,
  value,
  versions,
  files,
  busy,
  onSelect,
}: {
  language: Language;
  label: string;
  value: MoleculeRef | null;
  versions: ScientificObject[];
  files: Asset[];
  busy: boolean;
  onSelect(assetId: string, reference?: MoleculeRef): void;
}) {
  const zh = language === "zh";
  // A file collection and an immutable record are distinct usable inputs.
  const uploads = files;
  const selected = value?.version_id
    ? "version:" + value.version_id
    : value
      ? "file:" + value.asset_id
      : "";
  return (
    <label className="field">
      {label} · {zh ? "历史文件" : "Historical files"}
      <select
        value={selected}
        disabled={busy}
        onChange={(e) => {
          const key = e.target.value;
          const version = versions.find((v) => "version:" + v.id === key);
          if (version) onSelect(version.reference.asset_id, version.reference);
          else onSelect(uploads.find((f) => "file:" + f.id === key)?.id ?? "");
        }}
      >
        <option value="">
          {zh ? "选择历史文件" : "Choose a historical file"}
        </option>
        <optgroup label={zh ? "研究结果" : "Research results"}>
          {versions.map((v) => (
            <option key={v.id} value={"version:" + v.id}>
              {v.label}
              {v.kind === "molecule"
                ? ` · ${zh ? "记录" : "record"} ${v.reference.record + 1}`
                : ""}
            </option>
          ))}
        </optgroup>
        <optgroup label={zh ? "上传文件" : "Uploaded files"}>
          {uploads.map((f) => (
            <option key={f.id} value={"file:" + f.id}>
              {f.name}
            </option>
          ))}
        </optgroup>
        {selected &&
          !versions.some((v) => "version:" + v.id === selected) &&
          !uploads.some((f) => "file:" + f.id === selected) && (
            <option value={selected}>
              {zh ? "已选择的文件" : "Selected file"}
            </option>
          )}
      </select>
    </label>
  );
}
