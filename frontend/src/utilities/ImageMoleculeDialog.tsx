import { useEffect, useId, useRef, useState } from "react";
import type { Language } from "../types";
import type { ImageMolecule } from "./image-molecule";
import { useRecognitionBridge } from "./useRecognitionBridge";
import { recognitionFrameUrl } from "./recognition-locale";
import { useRecognitionLocale } from "./useRecognitionLocale";

export function ImageMoleculeDialog({
  file,
  language,
  disabled = false,
  automatic = false,
  initialMolecule,
  onAccept,
  onClose,
}: {
  file: File;
  language: Language;
  disabled?: boolean;
  automatic?: boolean;
  initialMolecule?: ImageMolecule;
  onAccept(value: ImageMolecule, source: File): Promise<void> | void;
  onClose(): void;
}) {
  const dialog = useRef<HTMLDialogElement>(null),
    title = useId();
  const [editing, setEditing] = useState(
    !automatic || Boolean(initialMolecule),
  );
  const compact = automatic && !editing;
  const bridge = useRecognitionBridge(file, language, onAccept, {
      automatic: compact,
      initialMolecule,
    }),
    zh = language === "zh";
  const [url] = useState(() =>
    recognitionFrameUrl(bridge.origin, language, true),
  );
  const locale = useRecognitionLocale(bridge.frame, bridge.origin, language);
  useEffect(() => {
    dialog.current?.showModal();
    const close = () => onClose();
    window.addEventListener("hashchange", close);
    window.addEventListener("popstate", close);
    return () => {
      window.removeEventListener("hashchange", close);
      window.removeEventListener("popstate", close);
      dialog.current?.close();
    };
  }, []);
  return (
    <dialog
      ref={dialog}
      className={"image-molecule-dialog" + (compact ? " is-automatic" : "")}
      aria-labelledby={title}
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
    >
      <header>
        <div>
          <h2 id={title}>
            {zh ? "从图片识别分子" : "Read molecule from image"}
          </h2>
          <p>
            {compact
              ? zh
                ? "识别后将直接带入当前工具，请在运行前核对结构。"
                : "The structure will appear in this tool. Check it before Run."
              : zh
                ? "开启识别服务，识别后核对或编辑结构，再带入当前任务。"
                : "Enable recognition, review or edit the structure, then use it in this task."}
          </p>
        </div>
        <button
          type="button"
          aria-label={zh ? "关闭图片识别" : "Close image recognition"}
          onClick={onClose}
        >
          ×
        </button>
      </header>
      {bridge.error && (
        <p role="alert" className="error-box">
          {bridge.error}
        </p>
      )}
      {locale.supported === false && (
        <p role="status">
          {zh
            ? "本地工作台尚不支持语言同步，请更新后重新连接。"
            : "Update the local workbench, then reconnect to enable language switching."}
        </p>
      )}
      {compact && (
        <div className="image-recognition-progress" role="status">
          {!(bridge.error || bridge.recognitionSupported === false) && (
            <span className="image-recognition-spinner" aria-hidden="true" />
          )}
          <span>
            {bridge.recognitionSupported === false
              ? zh
                ? "可打开编辑器继续，或更新本地识别组件。"
                : "Open the editor to continue, or update the local image component."
              : bridge.busy
                ? zh
                  ? "正在带入分子结构…"
                  : "Applying molecular structure…"
                : bridge.phase === "working"
                  ? zh
                    ? "正在识别结构…"
                    : "Recognizing structure…"
                  : bridge.error
                    ? zh
                      ? "本次导入未完成。"
                      : "This import did not complete."
                    : zh
                      ? "正在连接识别工具…"
                      : "Connecting to the image tool…"}
          </span>
        </div>
      )}
      <iframe
        ref={bridge.frame}
        src={url}
        className={compact ? "recognition-background-frame" : undefined}
        tabIndex={compact ? -1 : undefined}
        aria-hidden={compact || undefined}
        title={
          zh ? "结构图片识别与编辑" : "Structure image recognition and editing"
        }
        allow="clipboard-read; clipboard-write"
        onLoad={() => {
          locale.connect();
          bridge.connect();
        }}
      />
      <footer>
        <span>{bridge.filename}</span>
        <button type="button" className="secondary-button" onClick={onClose}>
          {automatic
            ? zh
              ? "取消导入"
              : "Cancel import"
            : zh
              ? "取消"
              : "Cancel"}
        </button>
        {compact && (
          <button
            type="button"
            className="secondary-button"
            disabled={bridge.busy || bridge.phase === "working"}
            onClick={() => setEditing(true)}
          >
            {zh ? "打开编辑器" : "Open editor"}
          </button>
        )}
        {compact &&
          bridge.error &&
          bridge.connected &&
          bridge.recognitionSupported && (
            <button
              type="button"
              className="primary-button"
              disabled={disabled || bridge.busy || bridge.phase === "working"}
              onClick={() =>
                bridge.phase === "ready" && bridge.valid
                  ? bridge.accept()
                  : bridge.recognize()
              }
            >
              {zh ? "重试" : "Retry"}
            </button>
          )}
        {!compact && (
          <button
            type="button"
            className="primary-button"
            disabled={
              disabled || !bridge.connected || !bridge.valid || bridge.busy
            }
            onClick={() => bridge.accept()}
          >
            {bridge.busy
              ? zh
                ? "正在带入…"
                : "Transferring…"
              : zh
                ? "使用此结构"
                : "Use this molecule"}
          </button>
        )}
      </footer>
    </dialog>
  );
}
