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
  mode = "import",
  initialMolecule,
  onAccept,
  onClose,
}: {
  file: File;
  language: Language;
  disabled?: boolean;
  automatic?: boolean;
  mode?: "import" | "power" | "hidden";
  initialMolecule?: ImageMolecule;
  onAccept(value: ImageMolecule, source: File): Promise<void> | void;
  onClose(keepFrame?: boolean): void;
}) {
  const dialog = useRef<HTMLDialogElement>(null),
    title = useId();
  const importing = mode === "import";
  const power = mode === "power";
  const autoApply = importing && automatic && !initialMolecule;
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
    if (mode === "hidden") return;
    const panel = dialog.current;
    panel?.showModal();
    return () => panel?.close();
  }, [mode]);
  useEffect(() => {
    if (mode === "hidden") return;
    const close = () => onClose(false);
    window.addEventListener("hashchange", close);
    window.addEventListener("popstate", close);
    return () => {
      window.removeEventListener("hashchange", close);
      window.removeEventListener("popstate", close);
    };
  }, [mode, onClose]);
  const dismiss = () =>
    onClose(
      importing &&
        bridge.connected &&
        !bridge.busy &&
        bridge.phase !== "working",
    );
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
      className={
        "image-molecule-dialog" + (power ? " recognition-power-dialog" : "")
      }
      hidden={mode === "hidden"}
      aria-labelledby={title}
      onCancel={(event) => {
        event.preventDefault();
        dismiss();
      }}
    >
      <header>
        <div>
          <h2 id={title}>
            {power
              ? zh
                ? "识别服务开关"
                : "Recognition power"
              : zh
                ? "从图片识别分子"
                : "Read molecule from image"}
          </h2>
          {importing && (
            <p>
              {autoApply
                ? zh
                  ? "打开识别后端，结构将自动带入当前工具。运行前请核对。"
                  : "Turn on recognition to fill this tool. Check the structure before running."
                : zh
                  ? "核对或编辑结构后带入任务。识别新图片时可在这里开启后端。"
                  : "Review or edit the structure before applying it. Turn on the backend here to recognize a new image."}
            </p>
          )}
        </div>
        <button
          type="button"
          aria-label={
            power ? undefined : zh ? "关闭图片识别" : "Close image recognition"
          }
          onClick={dismiss}
        >
          {power ? (zh ? "返回任务" : "Back to task") : "×"}
        </button>
      </header>
      {importing && bridge.error && (
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
          if (importing) bridge.connect();
        }}
      />
      {importing && (
        <footer>
          <span role="status">{progress || bridge.filename}</span>
          <button type="button" className="secondary-button" onClick={dismiss}>
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
      )}
    </dialog>
  );
}
