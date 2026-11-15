import { useEffect, useState } from "react";
import type { Language } from "../types";
import "./utilities.css";

/** Reuse the installed editor and its own authenticated lifecycle authority. */
export function ImageRecognition({ language }: { language: Language }) {
  const zh = language === "zh";
  const [attempt, setAttempt] = useState(0);
  const [status, setStatus] = useState<"checking" | "ready" | "offline">(
    "checking",
  );
  const hostname =
    location.hostname === "localhost" ? "localhost" : "127.0.0.1";
  const url = `http://${hostname}:8940/`;
  useEffect(() => {
    const controller = new AbortController();
    const deadline = window.setTimeout(() => controller.abort(), 5000);
    setStatus("checking");
    fetch("/api/utilities/recognition", {
      signal: controller.signal,
      cache: "no-store",
    })
      .then(async (response) => {
        if (!response.ok) throw new Error("Unavailable");
        const value = await response.json();
        if (!controller.signal.aborted)
          setStatus(value.available === true ? "ready" : "offline");
      })
      .catch(() => {
        if (!disposed) setStatus("offline");
      })
      .finally(() => window.clearTimeout(deadline));
    let disposed = false;
    return () => {
      disposed = true;
      controller.abort();
      window.clearTimeout(deadline);
    };
  }, [attempt]);
  return (
    <section
      className="utility-workspace"
      aria-label={zh ? "小工具" : "Utilities"}
    >
      <div className="utility-toolbar">
        <div>
          <h1>{zh ? "图片转分子结构" : "Image to molecular structure"}</h1>
          <p>
            {zh
              ? "粘贴或拖入结构图，识别后编辑、复制 SMILES 或导出。"
              : "Paste or drop a structure image, then edit, copy SMILES or export."}
          </p>
        </div>
        <div className="utility-actions">
          <button
            type="button"
            className="secondary-button"
            onClick={() => setAttempt((n) => n + 1)}
          >
            {zh ? "重新连接" : "Reconnect"}
          </button>
          <a href={url} target="_blank" rel="noreferrer">
            {zh ? "独立窗口 ↗" : "Open separately ↗"}
          </a>
        </div>
      </div>
      {status === "checking" && (
        <p role="status">
          {zh ? "正在连接本地工具…" : "Connecting to the local tool…"}
        </p>
      )}
      {status === "offline" && (
        <div className="utility-offline" role="status">
          <h2>
            {zh
              ? "图片识别工作台尚未打开"
              : "Image recognition workbench is offline"}
          </h2>
          <p>
            {zh
              ? "请打开已安装的 DECIMER 工作台，再点击「重新连接」。识别模型由工作台右上角开关按需启动。"
              : "Open the installed DECIMER workbench, then reconnect. Its top-right switch starts the recognition model when needed."}
          </p>
        </div>
      )}
      {status === "ready" && (
        <iframe
          key={attempt}
          className="utility-recognition-frame"
          src={url}
          title={
            zh ? "图片识别与分子编辑" : "Image recognition and molecular editor"
          }
          allow="clipboard-read; clipboard-write"
        />
      )}
    </section>
  );
}
