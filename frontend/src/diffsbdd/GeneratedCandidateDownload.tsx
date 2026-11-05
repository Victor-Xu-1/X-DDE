import { useLayoutEffect, useRef, useState } from "react";
import { SDF_ARTIFACT_MAX_BYTES } from "../presentation/artifact-digest";
import { readArtifactFile } from "../presentation/artifact-file";
import { sdfRecordBytes } from "../presentation/molecular-record";
import { downloadBlob } from "../presentation/visual-export";
import type { Language } from "../types";
import "./generated-candidate-download.css";

/** The caller keys this control by the verified source and selected record. */
export function GeneratedCandidateDownload({
  url,
  sha256,
  record,
  number,
  language,
}: {
  url: string;
  sha256: string;
  record: number;
  number: number;
  language: Language;
}) {
  const zh = language === "zh";
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
      downloadBlob(
        new Blob([sdfRecordBytes(bytes, record)], {
          type: "chemical/x-mdl-sdfile",
        }),
        `candidate-${number}.sdf`,
      );
      setState("idle");
    } catch {
      if (!attempt.signal.aborted) setState("error");
    } finally {
      pending.current = null;
    }
  }

  return (
    <div className="generated-candidate-download">
      <button
        type="button"
        disabled={state === "busy"}
        onClick={() => void download()}
      >
        {state === "busy"
          ? zh
            ? "正在核对…"
            : "Verifying…"
          : zh
            ? "下载所选候选 SDF"
            : "Download selected candidate SDF"}
      </button>
      {state === "error" && (
        <p role="alert">
          {zh
            ? "未能核对原始候选，请重试。"
            : "Could not verify the original candidate. Try again."}
        </p>
      )}
    </div>
  );
}
