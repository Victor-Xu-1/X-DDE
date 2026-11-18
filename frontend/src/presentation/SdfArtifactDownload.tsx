import { useLayoutEffect, useRef, useState } from "react";
import type { Language } from "../types";
import { SDF_ARTIFACT_MAX_BYTES } from "./artifact-digest";
import { readArtifactFile } from "./artifact-file";
import { sdfRecordBytes } from "./molecular-record";
import { downloadBlob } from "./visual-export";

/** Key the control by its selected source so a late read cannot save an old selection. */
export function SdfArtifactDownload({
  url,
  sha256,
  record,
  filename,
  language,
  label,
  errorLabel,
  className,
}: {
  url: string;
  sha256: string;
  record?: number;
  filename: string;
  language: Language;
  label: string;
  errorLabel: string;
  className?: string;
}) {
  const pending = useRef<AbortController | null>(null);
  const [state, setState] = useState<"idle" | "busy" | "error">("idle");
  useLayoutEffect(() => () => pending.current?.abort(), []);

  async function download() {
    if (pending.current) return;
    const attempt = new AbortController();
    pending.current = attempt;
    const signal = AbortSignal.any([
      attempt.signal,
      AbortSignal.timeout(30000),
    ]);
    setState("busy");
    try {
      const { bytes } = await readArtifactFile(url, signal, {
        maxBytes: SDF_ARTIFACT_MAX_BYTES,
        sha256,
      });
      signal.throwIfAborted();
      const payload =
        record === undefined ? bytes : sdfRecordBytes(bytes, record);
      downloadBlob(
        new Blob([payload], { type: "chemical/x-mdl-sdfile" }),
        filename,
      );
      setState("idle");
    } catch {
      if (!attempt.signal.aborted) setState("error");
    } finally {
      pending.current = null;
    }
  }

  return (
    <div className={className}>
      <button
        type="button"
        disabled={state === "busy"}
        onClick={() => void download()}
      >
        {state === "busy"
          ? language === "zh"
            ? "正在核对…"
            : "Verifying…"
          : label}
      </button>
      {state === "error" && <p role="alert">{errorLabel}</p>}
    </div>
  );
}
