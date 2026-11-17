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
  onAccept,
  onClose,
}: {
  file: File;
  language: Language;
  disabled?: boolean;
  onAccept(value: ImageMolecule, source: File): Promise<void> | void;
  onClose(): void;
}) {
  const dialog = useRef<HTMLDialogElement>(null),
    title = useId();
  const bridge = useRecognitionBridge(file, language, onAccept),
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
      className="image-molecule-dialog"
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
            {zh
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
      <iframe
        ref={bridge.frame}
        src={url}
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
          {zh ? "取消" : "Cancel"}
        </button>
        <button
          type="button"
          className="primary-button"
          disabled={
            disabled || !bridge.connected || !bridge.valid || bridge.busy
          }
          onClick={bridge.accept}
        >
          {bridge.busy
            ? zh
              ? "正在带入…"
              : "Transferring…"
            : zh
              ? "使用此结构"
              : "Use this molecule"}
        </button>
      </footer>
    </dialog>
  );
}
