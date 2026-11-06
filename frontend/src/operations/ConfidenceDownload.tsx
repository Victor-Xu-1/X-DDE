import { useLayoutEffect, useRef, useState } from "react";
import { artifactUrl } from "../api";
import { downloadBlob } from "../presentation/visual-export";
import type { Language } from "../types";
import type { Confidence } from "./confidence-data";

const LIMIT = 64 * 1024 ** 2;

export function ConfidenceDownload({
  job,
  candidate,
  data,
  language,
}: {
  job: string;
  candidate: string;
  data: Confidence;
  language: Language;
}) {
  const zh = language === "zh";
  const key = JSON.stringify([
    job,
    candidate,
    data.metric,
    data.native_sha256,
    data.native_artifact,
  ]);
  const pending = useRef<AbortController | null>(null);
  const [state, setState] = useState<{
    key: string;
    busy: boolean;
    error?: "changed" | "unavailable";
  }>();
  const current = state?.key === key ? state : undefined;
  const href = data.native_sha256
    ? `/api/jobs/${encodeURIComponent(job)}/confidence?${new URLSearchParams({ candidate, metric: data.metric, download: "true", source_sha256: data.native_sha256 })}`
    : artifactUrl(job, data.native_artifact);
  useLayoutEffect(
    () => () => {
      pending.current?.abort();
      pending.current = null;
    },
    [key],
  );

  async function download() {
    if (pending.current) return;
    const attempt = new AbortController();
    pending.current = attempt;
    const signal = AbortSignal.any([
      attempt.signal,
      AbortSignal.timeout(30000),
    ]);
    setState({ key, busy: true });
    let failure: "changed" | "unavailable" = "unavailable";
    try {
      const response = await fetch(href, { signal });
      if (response.status === 409) failure = "changed";
      if (
        !response.ok ||
        !response.body ||
        response.headers.get("content-type")?.split(";")[0] !==
          "application/octet-stream" ||
        Number(response.headers.get("content-length") ?? 0) > LIMIT
      )
        throw new Error("Native confidence download is unavailable.");
      const reader = response.body.getReader();
      const chunks: Uint8Array[] = [];
      let total = 0;
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        total += value.length;
        if (total > LIMIT) {
          await reader.cancel();
          throw new Error("Native confidence download is too large.");
        }
        chunks.push(value);
      }
      if (!total) throw new Error("Native confidence download is empty.");
      const bytes = new Uint8Array(total);
      let offset = 0;
      for (const chunk of chunks) {
        bytes.set(chunk, offset);
        offset += chunk.length;
      }
      const digest = [
        ...new Uint8Array(await crypto.subtle.digest("SHA-256", bytes)),
      ]
        .map((value) => value.toString(16).padStart(2, "0"))
        .join("");
      if (digest !== data.native_sha256) {
        failure = "changed";
        throw new Error("Native confidence identity changed.");
      }
      signal.throwIfAborted();
      downloadBlob(
        new Blob([bytes], { type: "application/octet-stream" }),
        data.native_artifact.split("/").at(-1)!,
      );
      setState({ key, busy: false });
    } catch {
      if (!attempt.signal.aborted)
        setState({ key, busy: false, error: failure });
    } finally {
      if (pending.current === attempt) pending.current = null;
    }
  }
  return (
    <>
      <a
        href={href}
        download
        aria-busy={current?.busy || undefined}
        aria-disabled={current?.busy || undefined}
        onClick={
          data.native_sha256
            ? (event) => {
                event.preventDefault();
                void download();
              }
            : undefined
        }
      >
        {current?.busy
          ? zh
            ? "正在准备下载…"
            : "Preparing download…"
          : zh
            ? "下载完整原生置信度"
            : "Download full native confidence"}
      </a>
      {current?.error && (
        <p role="alert" className="small">
          {current.error === "changed"
            ? zh
              ? "置信度文件已变化，请重新读取预览后再下载。"
              : "This confidence file changed. Reload its preview before downloading."
            : zh
              ? "暂时无法下载，请重试或重新读取置信度。"
              : "The download is unavailable. Retry or reload confidence."}
        </p>
      )}
    </>
  );
}
