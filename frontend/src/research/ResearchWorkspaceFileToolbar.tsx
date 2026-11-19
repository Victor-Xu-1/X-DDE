import { CloseOutlined, ReloadOutlined } from "@ant-design/icons";
import type { AssetKind } from "../operations/types";
import { FileSelect } from "../presentation/FileSelect";
import type { Language } from "../types";
import { objectLabels, type ObjectKind } from "./types";

const formats = {
  molecule: { accept: ".sdf,.mol,.mol2", assetKind: "ligand" },
  structure: { accept: ".pdb,.cif", assetKind: "structure" },
  sequence: { accept: ".fasta,.fa", assetKind: "sequences" },
} satisfies Partial<Record<ObjectKind, { accept: string; assetKind: AssetKind }>>;
export type ResearchUploadKind = keyof typeof formats;
const uploadKinds = Object.keys(formats) as ResearchUploadKind[];

export function ResearchWorkspaceFileToolbar({
  language,
  busy,
  kind,
  onKindChange,
  onUpload,
  onRefresh,
  onClear,
}: {
  language: Language;
  busy: boolean;
  kind: ResearchUploadKind;
  onKindChange(value: ResearchUploadKind): void;
  onUpload(file: File, kind: ResearchUploadKind, assetKind: AssetKind): void;
  onRefresh(): void;
  onClear?: () => void;
}) {
  const zh = language === "zh";
  const typeLabel = zh ? "材料类型" : "Upload type";
  const upload = zh ? "上传材料" : "Upload material";
  const refresh = zh ? "刷新" : "Refresh";
  const clear = zh ? "取消选择" : "Clear selection";
  return (
    <div className="editor-toolbar research-file-toolbar">
      <div className="research-file-upload">
        <label>
          <span className="research-upload-label">{typeLabel}</span>
          <select
            aria-label={typeLabel}
            value={kind}
            disabled={busy}
            onChange={(event) =>
              onKindChange(event.currentTarget.value as ResearchUploadKind)
            }
          >
            {uploadKinds.map((option) => (
              <option key={option} value={option}>
                {objectLabels[option][zh ? 0 : 1]}
              </option>
            ))}
          </select>
        </label>
        <label className="file-choice">
          <span className="research-upload-label">{upload}</span>
          <FileSelect
            language={language}
            variant="compact"
            aria-label={upload}
            disabled={busy}
            accept={formats[kind].accept}
            onChange={(event) => {
              const control = event.currentTarget;
              const file = control.files?.[0];
              if (file) onUpload(file, kind, formats[kind].assetKind);
              control.value = "";
            }}
          />
        </label>
      </div>
      <div className="research-file-actions">
        <button
          type="button"
          aria-label={refresh}
          title={refresh}
          onClick={onRefresh}
          disabled={busy}
        >
          <ReloadOutlined aria-hidden="true" />
          <span className="research-file-action-label">{refresh}</span>
        </button>
        {onClear && (
          <button type="button" aria-label={clear} title={clear} onClick={onClear}>
            <CloseOutlined aria-hidden="true" />
            <span className="research-file-action-label">{clear}</span>
          </button>
        )}
      </div>
    </div>
  );
}
