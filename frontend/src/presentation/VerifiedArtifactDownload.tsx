import { useLayoutEffect, useRef, useState } from "react";
import type { Language } from "../types";
import { readArtifactFile } from "./artifact-file";
import { downloadBlob } from "./visual-export";

export function VerifiedArtifactDownload({
  url,
  sha256,
  filename,
  language,
  label,
  downloadLabel,
  className,
}: {
  url: string;
  sha256: string;
  filename: string;
  language: Language;
  label: string;
  downloadLabel: string;
  className?: string;
}) {
  const pending = useRef<AbortController | null>(null);
  const [state, setState] = useState<"idle" | "reading" | "error">("idle");
  const zh = language === "zh";
  useLayoutEffect(() => {
    setState("idle");
    return () => {
      pending.current?.abort();
      pending.current = null;
    };
  }, [url, sha256]);

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
      const { bytes } = await readArtifactFile(url, signal, {
        sha256,
        maxBytes: 25 * 1024 ** 2,
      });
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
