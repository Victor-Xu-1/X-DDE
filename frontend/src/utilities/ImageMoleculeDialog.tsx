import { useEffect, useId, useLayoutEffect, useRef, useState } from "react";
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
  const autoApply = automatic && !initialMolecule;
  const bridge = useRecognitionBridge(file, language, onAccept, {
      automatic: autoApply,
      initialMolecule,
    }),
    zh = language === "zh";
  const [url] = useState(() =>
    recognitionFrameUrl(bridge.origin, language, true),
  );
  const locale = useRecognitionLocale(bridge.frame, bridge.origin, language);
  useLayoutEffect(() => {
    const panel = dialog.current;
    panel?.showModal();
    return () => panel?.close();
  }, []);
  useEffect(() => {
    window.addEventListener("hashchange", onClose);
    window.addEventListener("popstate", onClose);
    return () => {
      window.removeEventListener("hashchange", onClose);
      window.removeEventListener("popstate", onClose);
    };
  }, [onClose]);
  const progress = bridge.busy
    ? zh
      ? "正在带入分子结构…"
      : "Applying molecular structure…"
    : bridge.phase === "working"
      ? zh
        ? "正在识别结构…"
        : "Recognizing structure…"
      : "";
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
            {autoApply
              ? zh
                ? "打开识别后端，结构将自动带入当前工具。运行前请核对。"
                : "Turn on recognition to fill this tool. Check the structure before running."
              : zh
                ? "核对或编辑结构后带入任务。识别新图片时可在这里开启后端。"
                : "Review or edit the structure before applying it. Turn on the backend here to recognize a new image."}
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
      {autoApply && bridge.recognitionSupported === false && (
        <p role="status">
          {zh
            ? "此版本需要在编辑器内点击「开始识别」，然后使用识别出的结构。"
            : "Use Start recognition in the editor, then apply the structure."}
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
        <span role="status">{progress || bridge.filename}</span>
        <button type="button" className="secondary-button" onClick={onClose}>
          {automatic
            ? zh
              ? "取消导入"
              : "Cancel import"
            : zh
              ? "取消"
              : "Cancel"}
        </button>
        {autoApply &&
          bridge.error &&
          bridge.recognitionSupported &&
          bridge.recognitionServiceReady &&
          !bridge.valid && (
            <button
              type="button"
              className="primary-button"
              disabled={disabled || bridge.busy || bridge.phase === "working"}
              onClick={bridge.recognize}
            >
              {zh ? "重试" : "Retry"}
            </button>
          )}
        <button
          type="button"
          className="primary-button"
          disabled={disabled || !bridge.valid || bridge.busy}
          onClick={bridge.accept}
        >
          {zh ? "使用此结构" : "Use this molecule"}
        </button>
      </footer>
    </dialog>
  );
}
