import type { Language } from "../types";
import type { Asset, AssetKind } from "./types";
import { FileSelect } from "../presentation/FileSelect";
import { researchError } from "../presentation/research-content";
import { useAssetUpload } from "./useAssetUpload";

/** Unmounting this source invalidates its existing native upload lifecycle. */
export function AssetPickerUpload({
  kind,
  formats,
  maxBytes,
  value,
  onChange,
  onAsset,
  language,
  label,
}: {
  kind: AssetKind;
  formats: readonly string[];
  maxBytes: number;
  value: string;
  onChange(id: string): void;
  onAsset(asset: Asset): void;
  language: Language;
  label: string;
}) {
  const zh = language === "zh";
  const upload = useAssetUpload(
    kind,
    formats,
    maxBytes,
    value,
    onChange,
    onAsset,
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
    <>
      <label className="file-upload">
        {upload.busy && (
          <span role="status">{zh ? "上传中…" : "Uploading…"}</span>
        )}
        <FileSelect
          language={language}
          description={
            formats
              .join(",")
              .replaceAll(".", "")
              .split(",")
              .join(" · ")
              .toUpperCase() +
            (zh ? " · 最大 " : " · Up to ") +
            maxBytes / 1024 ** 2 +
            " MiB"
          }
          aria-label={(zh ? "上传 " : "Upload ") + label}
          accept={formats.join(",")}
          disabled={upload.busy}
          onChange={(event) => {
            const file = event.target.files?.[0];
            event.target.value = "";
            if (file) void upload.upload(file);
          }}
        />
      </label>
      {upload.error && (
        <p role="alert" className="error-box">
          {error}
        </p>
      )}
    </>
  );
}
