import { useLayoutEffect, useRef, useState } from "react";
import type { Language } from "../types";
import { readArtifactFile } from "./artifact-file";
import { downloadBlob } from "./visual-export";
import { readAssetFileWithMetadata } from "../research/asset-file";
import type { MoleculeRef } from "../research/types";

type DownloadSource =
  | { reference: Pick<MoleculeRef, "asset_id" | "sha256"> }
  | { url: string; sha256: string; filename: string };

async function readDownload(source: DownloadSource, signal: AbortSignal) {
  const limits = { maxBytes: 25 * 1024 ** 2 };
  if ("reference" in source) {
    const { bytes, name } = await readAssetFileWithMetadata(
      source.reference,
      signal,
      limits,
    );
    if (!name || /[\\/\x00-\x1f\x7f]/.test(name))
      throw new Error("Invalid saved filename.");
    return { bytes, filename: name };
  }
  const { bytes } = await readArtifactFile(source.url, signal, {
    ...limits,
    sha256: source.sha256,
  });
  return { bytes, filename: source.filename };
}

export function VerifiedArtifactDownload(
  props: DownloadSource & {
    language: Language;
    label: string;
    downloadLabel: string;
    className?: string;
  },
) {
  const { language, label, downloadLabel, className } = props;
  const identity =
    "reference" in props
      ? [props.reference.asset_id, props.reference.sha256]
      : [props.url, props.sha256, props.filename];
  const key = JSON.stringify(identity);
  const sha256 = "reference" in props ? props.reference.sha256 : props.sha256;
  const pending = useRef<AbortController | null>(null);
  const [state, setState] = useState<"idle" | "reading" | "error">("idle");
  const zh = language === "zh";
  useLayoutEffect(() => {
    setState("idle");
    return () => {
      pending.current?.abort();
      pending.current = null;
    };
  }, [key]);

  async function download() {
    if (pending.current) return;
    const attempt = new AbortController();
    pending.current = attempt;
    const signal = AbortSignal.any([
      attempt.signal,
      AbortSignal.timeout(30000),
    ]);
    setState("reading");
    try {
      if (!/^[0-9a-f]{64}$/.test(sha256))
        throw new Error("Missing artifact checksum.");
      const { bytes, filename } = await readDownload(props, signal);
      signal.throwIfAborted();
      downloadBlob(new Blob([bytes]), filename);
      setState("idle");
    } catch {
      if (!attempt.signal.aborted) setState("error");
    } finally {
      if (pending.current === attempt) pending.current = null;
    }
  }

  return (
    <span className="verified-artifact-download">
      <button
        type="button"
        className={className}
        disabled={state === "reading"}
        aria-label={downloadLabel}
        title={downloadLabel}
        onClick={() => void download()}
      >
        {state === "reading" ? (zh ? "正在校验…" : "Verifying…") : label}
      </button>
      {state === "error" && (
        <span className="field-help" role="alert">
          {zh ? "无法核对保存的文件。" : "Could not verify the saved file."}
        </span>
      )}
    </span>
  );
}
