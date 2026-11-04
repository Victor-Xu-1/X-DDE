import { useLayoutEffect, useRef, useState } from "react";
import type { Language } from "../types";
import { downloadBlob } from "./visual-export";

export function PredictionArchiveDownload({
  job,
  language,
}: {
  job: string;
  language: Language;
}) {
  const zh = language === "zh";
  const active = useRef<AbortController | null>(null);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  useLayoutEffect(() => () => active.current?.abort(), []);

  async function download() {
    if (active.current) return;
    const controller = new AbortController();
    active.current = controller;
    const signal = AbortSignal.any([
      controller.signal,
      AbortSignal.timeout(90000),
    ]);
    setBusy(true);
    setFailed(false);
    try {
      const response = await fetch(
        `/api/jobs/${encodeURIComponent(job)}/prediction-results.zip`,
        { signal },
      );
      const size = Number(response.headers.get("content-length"));
      if (
        !response.ok ||
        response.headers.get("content-type") !== "application/zip" ||
        !Number.isSafeInteger(size) ||
        size <= 0 ||
        size > 129 * 1024 ** 2
      )
        throw new Error("Prediction archive is unavailable.");
      const blob = await response.blob();
      signal.throwIfAborted();
      if (blob.size !== size)
        throw new Error("Prediction archive is incomplete.");
      downloadBlob(blob, `${job}-prediction-results.zip`);
    } catch {
      if (!controller.signal.aborted) setFailed(true);
    } finally {
      active.current = null;
      if (!controller.signal.aborted) setBusy(false);
    }
  }

  return (
    <div className="prediction-archive-download">
      <button
        type="button"
        className="primary-button"
        disabled={busy}
        onClick={() => void download()}
        title={
          zh
            ? "构象、置信度和已保存的序列比对"
            : "Structures, confidence and retained sequence alignments"
        }
      >
        {busy
          ? zh
            ? "正在准备…"
            : "Preparing…"
          : zh
            ? "下载全部数据"
            : "Download all data"}
      </button>
      {failed && (
        <p role="alert" className="field-help">
          {zh
            ? "暂时无法下载结果包。请重试，或在下方单独下载科研文件。"
            : "The archive is unavailable. Retry or download the research files individually below."}
        </p>
      )}
    </div>
  );
}
