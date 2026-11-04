import { useEffect, useState } from "react";
import type { Language } from "../types";
import { readArtifactResponse } from "./artifact-file";
import { PredictionReviewDialog } from "./PredictionReviewDialog";
import { downloadBlob } from "./visual-export";
import "./prediction-history-input.css";

const sources = {
  retained: ["已保存的输入文件", "Stored input document"],
  reconstructed: [
    "根据任务记录重建的输入",
    "Input reconstructed from the task record",
  ],
  "recorded-request": [
    "任务记录中的提交请求",
    "Submitted request from the task record",
  ],
} as const;

async function readInput(jobId: string, signal: AbortSignal) {
  const response = await fetch(`/api/jobs/${encodeURIComponent(jobId)}/input`, {
    signal,
  });
  const { bytes } = await readArtifactResponse(response, signal, {
    maxBytes: 4 * 1024 ** 2,
  });
  const source = response.headers.get("X-XDDE-Input-Source");
  if (
    source !== "retained" &&
    source !== "reconstructed" &&
    source !== "recorded-request"
  )
    throw new Error("Input provenance is unavailable");
  const text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  const value: unknown = JSON.parse(text);
  if (!value || typeof value !== "object")
    throw new Error("Invalid task input");
  return {
    sourceLabel: sources[source],
    text,
    preview: JSON.stringify(value, null, 2),
    bytes,
  };
}

function InputDialog({
  jobId,
  label,
  language,
  onClose,
}: {
  jobId: string;
  label: string;
  language: Language;
  onClose(): void;
}) {
  const zh = language === "zh";
  const [attempt, setAttempt] = useState(0);
  const [input, setInput] = useState<Awaited<
    ReturnType<typeof readInput>
  > | null>(null);
  const [failed, setFailed] = useState(false);
  const [copyState, setCopyState] = useState<
    "pending" | "done" | "failed" | null
  >(null);
  useEffect(() => {
    const controller = new AbortController();
    const signal = AbortSignal.any([
      controller.signal,
      AbortSignal.timeout(15000),
    ]);
    void readInput(jobId, signal).then(
      (document) => {
        if (!controller.signal.aborted) setInput(document);
      },
      () => {
        if (!controller.signal.aborted) setFailed(true);
      },
    );
    return () => controller.abort();
  }, [jobId, attempt]);

  async function copy() {
    if (!input) return;
    setCopyState("pending");
    try {
      await navigator.clipboard.writeText(input.text);
      setCopyState("done");
    } catch {
      setCopyState("failed");
    }
  }

  return (
    <PredictionReviewDialog
      language={language}
      title={(zh ? "输入 · " : "Input · ") + label}
      onClose={onClose}
      historical
      actions={
        input && (
          <>
            <button
              type="button"
              className="primary-button"
              onClick={() =>
                downloadBlob(
                  new Blob([input.bytes], { type: "application/json" }),
                  jobId + "-input.json",
                )
              }
            >
              {zh ? "下载 JSON" : "Download JSON"}
            </button>
            <button
              type="button"
              className="secondary-button"
              onClick={() => void copy()}
              disabled={copyState === "pending"}
            >
              {copyState === "done"
                ? zh
                  ? "已复制"
                  : "Copied"
                : zh
                  ? "复制 JSON"
                  : "Copy JSON"}
            </button>
          </>
        )
      }
    >
      {input ? (
        <>
          <p className="prediction-history-source">
            {input.sourceLabel[zh ? 0 : 1]}
          </p>
          <pre tabIndex={0} aria-label={zh ? "输入 JSON" : "Input JSON"}>
            {input.preview}
          </pre>
          {copyState === "failed" && (
            <p role="status">
              {zh
                ? "无法写入剪贴板。可以直接选中文字或下载 JSON。"
                : "Clipboard access is unavailable. Select the text or download the JSON."}
            </p>
          )}
        </>
      ) : failed ? (
        <div className="prediction-history-unavailable">
          <p role="alert">
            {zh
              ? "暂时无法读取这条任务的输入。"
              : "This task’s input could not be loaded."}
          </p>
          <button
            type="button"
            className="secondary-button"
            onClick={() => {
              setFailed(false);
              setAttempt((current) => current + 1);
            }}
          >
            {zh ? "重试读取" : "Retry loading"}
          </button>
        </div>
      ) : (
        <p role="status">{zh ? "正在读取输入…" : "Loading input…"}</p>
      )}
    </PredictionReviewDialog>
  );
}

export function HistoricalPredictionInput({
  jobId,
  label,
  language,
}: {
  jobId: string;
  label: string;
  language: Language;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        className="secondary-button prediction-history-trigger"
        onClick={() => setOpen(true)}
      >
        {language === "zh" ? "查看输入" : "View input"}
      </button>
      {open && (
        <InputDialog
          jobId={jobId}
          label={label}
          language={language}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  );
}
