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
  className = "",
  inputOwner = false,
  automatic = false,
  cancelOnEdit = false,
  review,
  onSourceEdit,
  onImageSelected,
  onMolecule,
  children,
}: {
  language: Language;
  enabled?: boolean;
  disabled?: boolean;
  className?: string;
  inputOwner?: boolean;
  automatic?: boolean;
  cancelOnEdit?: boolean;
  review?: { molecule: ImageMolecule; image: File };
  onSourceEdit?(): void;
  onImageSelected?(editing: boolean): void;
  onMolecule(
    value: ImageMolecule,
    source: File,
    signal: AbortSignal,
  ): Promise<void> | void;
  children?: ReactNode;
}) {
  const presentation = useContext(TaskPresentationContext);
  enabled =
    enabled &&
    presentation?.active !== false &&
    (inputOwner || presentation?.imageEntry !== "workspace");
  const zh = language === "zh",
    picker = useRef<HTMLInputElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const surface = useRef<HTMLDivElement>(null);
  const session = useImageInputSession({
    enabled,
    disabled,
    onMolecule,
    trigger,
    onImageSelected,
  });
  function owns(target: EventTarget) {
    return (
      target instanceof Element &&
      target.closest(".image-molecule-input") === surface.current
    );
  }
  function edit(target: EventTarget) {
    if (
      !cancelOnEdit ||
      !owns(target) ||
      !(target instanceof Element) ||
      target.closest(".image-molecule-actions") ||
      target === picker.current
    )
      return;
    session.close(false);
    if (target.closest("[data-molecule-source],.asset-picker,.diff-reference"))
      onSourceEdit?.();
  }
  const errors = {
    format: zh
      ? "请选择不超过 10 MB 的 PNG、JPEG、WebP 或 BMP 图片。"
      : "Use a PNG, JPEG, WebP or BMP image up to 10 MB.",
    empty: zh ? "剪贴板中没有图片。" : "No image in the clipboard.",
    clipboard: zh
      ? "请在此处按 Ctrl+V 粘贴，或拖入图片。"
      : "Press Ctrl+V here, or drop an image.",
  };
  if (!enabled && !inputOwner) return <>{children}</>;
  return (
    <div
      ref={surface}
      className={"image-molecule-input " + className}
      onClickCapture={(event) => edit(event.target)}
      onChangeCapture={(event) => edit(event.target)}
      onPasteCapture={(event) => {
        if (!owns(event.target)) return;
        const image = Array.from(event.clipboardData.files).find((item) =>
          item.type.startsWith("image/"),
        );
        if (image) {
          event.preventDefault();
          event.stopPropagation();
          session.select(image);
        }
      }}
      onDragOverCapture={(event) => {
        if (!owns(event.target)) return;
        if (
          Array.from(event.dataTransfer.items).some((item) =>
            item.type.startsWith("image/"),
          )
        )
          event.preventDefault();
      }}
      onDropCapture={(event) => {
        if (!owns(event.target)) return;
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
          {automatic
            ? zh
              ? "上传结构图"
              : "Upload structure image"
            : zh
              ? "从结构图片输入"
              : "Input from structure image"}
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
        {review && (
          <button
            type="button"
            className="text-button"
            disabled={session.disabled}
            onClick={() => session.review(review.molecule, review.image)}
          >
            {zh ? "编辑识别的结构" : "Edit recognized structure"}
          </button>
        )}
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
            automatic={automatic && !session.selection.initialMolecule}
            initialMolecule={session.selection.initialMolecule}
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
