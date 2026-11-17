import { useContext, useRef, type ReactNode } from "react";
import { createPortal } from "react-dom";
import type { Language } from "../types";
import { ImageMoleculeDialog } from "./ImageMoleculeDialog";
import type { ImageMolecule } from "./image-molecule";
import { useImageInputSession } from "./useImageInputSession";
import "./image-molecule.css";
import { TaskPresentationContext } from "../guided/TaskPresentation";

export function ImageMoleculeInput({
  language,
  enabled = true,
  disabled = false,
  onMolecule,
  children,
}: {
  language: Language;
  enabled?: boolean;
  disabled?: boolean;
  onMolecule(
    value: ImageMolecule,
    source: File,
    signal: AbortSignal,
  ): Promise<void> | void;
  children?: ReactNode;
}) {
  const presentation = useContext(TaskPresentationContext);
  enabled = enabled && presentation?.active !== false;
  const zh = language === "zh",
    picker = useRef<HTMLInputElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const session = useImageInputSession({
    enabled,
    disabled,
    onMolecule,
    trigger,
  });
  const errors = {
    format: zh
      ? "请选择不超过 10 MB 的 PNG、JPEG、WebP 或 BMP 图片。"
      : "Use a PNG, JPEG, WebP or BMP image up to 10 MB.",
    empty: zh ? "剪贴板中没有图片。" : "No image in the clipboard.",
    clipboard: zh
      ? "请在此处按 Ctrl+V 粘贴，或拖入图片。"
      : "Press Ctrl+V here, or drop an image.",
  };
  if (!enabled) return <>{children}</>;
  return (
    <div
      className="image-molecule-input"
      onPaste={(event) => {
        const image = Array.from(event.clipboardData.files).find((item) =>
          item.type.startsWith("image/"),
        );
        if (image) {
          event.preventDefault();
          event.stopPropagation();
          session.select(image);
        }
      }}
      onDragOver={(event) => {
        if (
          Array.from(event.dataTransfer.items).some((item) =>
            item.type.startsWith("image/"),
          )
        )
          event.preventDefault();
      }}
      onDrop={(event) => {
        const image = Array.from(event.dataTransfer.files).find((item) =>
          item.type.startsWith("image/"),
        );
        if (image) {
          event.preventDefault();
          event.stopPropagation();
          session.select(image);
        }
      }}
    >
      {children}
      <div className="image-molecule-actions">
        <button
          ref={trigger}
          type="button"
          className="secondary-button"
          disabled={session.disabled}
          onClick={() => {
            if (session.choose()) picker.current?.click();
          }}
        >
          {zh ? "从结构图片输入" : "Input from structure image"}
        </button>
        <button
          type="button"
          className="text-button"
          disabled={session.disabled}
          onClick={() => void session.paste()}
        >
          {zh ? "粘贴截图" : "Paste screenshot"}
        </button>
        <span>
          {zh ? "也可直接拖入结构图" : "Or drop a structure image here"}
        </span>
      </div>
      <input
        ref={picker}
        type="file"
        hidden
        aria-label={zh ? "选择结构图片" : "Choose structure image"}
        accept="image/png,image/jpeg,image/webp,image/bmp"
        disabled={session.disabled}
        onChange={(event) => {
          const image = event.target.files?.[0];
          event.target.value = "";
          if (image) session.picked(image);
        }}
      />
      {session.error && (
        <p role="alert" className="error-box">
          {errors[session.error]}
        </p>
      )}
      {session.selection &&
        createPortal(
          <ImageMoleculeDialog
            key={session.selection.token.id}
            file={session.selection.file}
            language={language}
            disabled={session.disabled}
            onClose={() => session.close()}
            onAccept={(value, source) =>
              session.accept(session.selection!, value, source)
            }
          />,
          document.body,
        )}
    </div>
  );
}
