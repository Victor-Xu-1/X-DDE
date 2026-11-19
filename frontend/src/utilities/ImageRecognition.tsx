import { useEffect, useRef, useState } from "react";
import type { Language } from "../types";
import { Hint } from "../guided/Hint";
import { createPortal } from "react-dom";
import { ExportOutlined, ReloadOutlined } from "@ant-design/icons";
import "./utilities.css";
import { recognitionFrameUrl } from "./recognition-locale";
import { useRecognitionLocale } from "./useRecognitionLocale";
import { BackendPowerSwitch } from "./BackendPowerSwitch";
import {
  drawingDestinations,
  useRecognitionDrawing,
  type DrawingDestination,
  type EditorDrawing,
} from "./useRecognitionDrawing";

/** Reuse the installed editor and its own authenticated lifecycle authority. */
export function ImageRecognition({
  language,
  actionsTarget,
  visible = true,
  focusRequest = 0,
  onHandoff,
}: {
  language: Language;
  actionsTarget?: HTMLElement | null;
  visible?: boolean;
  focusRequest?: number;
  onHandoff?(destination: DrawingDestination, value: EditorDrawing): void;
}) {
  const zh = language === "zh";
  const [attempt, setAttempt] = useState(0);
  const [connection, setConnection] = useState<{
    status: "checking" | "ready" | "offline";
    focusRequest: number;
  }>({ status: "checking", focusRequest: 0 });
  const { status } = connection;
  const hostname =
    location.hostname === "localhost" ? "localhost" : "127.0.0.1";
  const origin = `http://${hostname}:8940`;
  const frame = useRef<HTMLIFrameElement>(null);
  const reconnect = useRef<HTMLButtonElement>(null);
  const lastFocusedRequest = useRef(0);
  const [url] = useState(() =>
    recognitionFrameUrl(origin, language, onHandoff ? "drawing" : false),
  );
  const locale = useRecognitionLocale(
    frame,
    origin,
    language,
    status === "ready",
  );
  const drawing = useRecognitionDrawing(
    frame,
    origin,
    visible && status === "ready",
    onHandoff,
  );
  useEffect(() => {
    if (!visible) return;
    const controller = new AbortController();
    const deadline = window.setTimeout(() => controller.abort(), 5000);
    let disposed = false;
    function settle(status: "ready" | "offline") {
      if (!disposed) setConnection({ status, focusRequest });
    }
    fetch("/api/utilities/recognition", {
      signal: controller.signal,
      cache: "no-store",
    })
      .then(async (response) => {
        if (!response.ok) throw new Error("Unavailable");
        const value = await response.json();
        settle(
          value.available === true && !controller.signal.aborted
            ? "ready"
            : "offline",
        );
      })
      .catch(() => {
        settle("offline");
      })
      .finally(() => window.clearTimeout(deadline));
    return () => {
      disposed = true;
      controller.abort();
      window.clearTimeout(deadline);
    };
  }, [attempt, focusRequest, visible]);
  useEffect(() => {
    if (
      !visible ||
      connection.focusRequest !== focusRequest ||
      focusRequest <= lastFocusedRequest.current ||
      status === "checking"
    )
      return;
    const target = status === "ready" ? frame.current : reconnect.current;
    if (target) {
      lastFocusedRequest.current = focusRequest;
      target.focus();
    }
  }, [connection, focusRequest, status, visible]);
  const actions = (
    <div className="utility-editor-tools">
      {status === "offline" && (
        <BackendPowerSwitch
          id="decimer"
          name="DECIMER"
          status={zh ? "工作台未连接" : "Workbench offline"}
          enabled={false}
          disabled
        />
      )}
      {drawing.available !== null && (
        <select
          className="utility-drawing-destination"
          aria-label={zh ? "将结构用于计算" : "Use structure in a task"}
          value=""
          disabled={!drawing.available || drawing.busy}
          onChange={(e) => {
            const destination = e.target.value;
            if (Object.hasOwn(drawingDestinations, destination))
              drawing.send(destination as DrawingDestination);
          }}
        >
          <option value="">
            {drawing.busy
              ? zh
                ? "正在读取结构…"
                : "Reading structure…"
              : zh
                ? "将结构用于…"
                : "Use structure in…"}
          </option>
          {Object.entries(drawingDestinations).map(([value, labels]) => (
            <option key={value} value={value}>
              {labels[zh ? 0 : 1]}
            </option>
          ))}
        </select>
      )}
      <Hint label={zh ? "图片输入帮助" : "Image input help"}>
        {zh
          ? "粘贴或拖入结构图，识别后编辑、复制 SMILES 或导出。"
          : "Paste or drop a structure image, then edit, copy SMILES or export."}
      </Hint>
      <div className="utility-actions">
        <button
          ref={reconnect}
          type="button"
          className="secondary-button"
          aria-label={zh ? "重新连接" : "Reconnect"}
          title={zh ? "重新连接" : "Reconnect"}
          onClick={() => setAttempt((n) => n + 1)}
        >
          <ReloadOutlined aria-hidden="true" />
        </button>
        <a
          href={`${origin}/?lang=${language}`}
          target="_blank"
          rel="noreferrer"
          aria-label={zh ? "独立窗口" : "Open separately"}
          title={zh ? "独立窗口" : "Open separately"}
        >
          <ExportOutlined aria-hidden="true" />
        </a>
      </div>
    </div>
  );
  return (
    <section
      className="utility-recognition"
      aria-label={zh ? "小工具" : "Utilities"}
    >
      <h1 className="sr-only">
        {zh ? "图片转分子结构" : "Image to molecular structure"}
      </h1>
      {actionsTarget ? createPortal(actions, actionsTarget) : actions}
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
        <>
          {drawing.failed && (
            <p className="utility-drawing-error" role="alert">
              {zh
                ? "未能读取当前绘图。请核对后重试。"
                : "Could not read the current drawing. Review it and retry."}
            </p>
          )}
          {locale.supported === false && (
            <p role="status">
              {zh
                ? "本地工作台尚不支持语言同步，请更新后重新连接。"
                : "Update the local workbench, then reconnect to enable language switching."}
            </p>
          )}
          <iframe
            ref={frame}
            key={attempt}
            className="utility-recognition-frame"
            src={url}
            title={
              zh
                ? "图片识别与分子编辑"
                : "Image recognition and molecular editor"
            }
            allow="clipboard-read; clipboard-write"
            onLoad={() => {
              locale.connect();
              drawing.connect();
            }}
          />
        </>
      )}
    </section>
  );
}
