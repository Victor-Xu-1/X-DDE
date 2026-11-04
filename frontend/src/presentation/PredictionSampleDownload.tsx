import { useLayoutEffect, useRef, useState } from "react";
import { artifactUrl } from "../api";
import type { Language } from "../types";
import { downloadBlob } from "./visual-export";

export function PredictionSampleDownload({
  job,
  candidate,
  artifact,
  language,
}: {
  job: string;
  candidate: string;
  artifact: string;
  language: Language;
}) {
  const zh = language === "zh";
  const pending = useRef<AbortController | null>(null);
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<"legacy" | "unavailable" | null>(null);
  useLayoutEffect(() => () => pending.current?.abort(), []);

  async function download() {
    if (pending.current) return;
    const attempt = new AbortController();
    pending.current = attempt;
    const signal = AbortSignal.any([
      attempt.signal,
      AbortSignal.timeout(30000),
    ]);
    setFailure(null);
    setBusy(true);
    try {
      const response = await fetch(
        `/api/jobs/${encodeURIComponent(job)}/prediction-sample.zip?${new URLSearchParams({ candidate })}`,
        { signal },
      );
      if (response.status === 409) {
        const payload = await response.json();
        signal.throwIfAborted();
        if (payload?.detail?.code === "legacy_unsealed_structure") {
          setFailure("legacy");
          return;
        }
      }
      if (
        !response.ok ||
        response.headers.get("content-type") !== "application/zip"
      )
        throw new Error("Prediction package is unavailable.");
      const blob = await response.blob();
      signal.throwIfAborted();
      downloadBlob(blob, `${job}-${candidate}.zip`);
    } catch {
      if (!attempt.signal.aborted) setFailure("unavailable");
    } finally {
      pending.current = null;
      if (!attempt.signal.aborted) setBusy(false);
    }
  }
  return (
    <div className="prediction-sample-download">
      <button
        type="button"
        className="prediction-model-download"
        disabled={busy}
        onClick={() => void download()}
        title={
          zh
            ? "当前构象和可用的原始置信度摘要"
            : "Selected structure and available native confidence summary"
        }
      >
        {busy
          ? zh
            ? "正在准备…"
            : "Preparing…"
          : zh
            ? "下载此构象 ↓"
            : "This model ↓"}
      </button>
      {failure && (
        <div role="alert">
          {zh ? "构象包暂不可下载。" : "The sample package is unavailable."}{" "}
          {failure === "legacy" && (
            <a href={artifactUrl(job, artifact)} download>
              {zh ? "下载原始 CIF" : "Download original CIF"}
            </a>
          )}
        </div>
      )}
    </div>
  );
}
