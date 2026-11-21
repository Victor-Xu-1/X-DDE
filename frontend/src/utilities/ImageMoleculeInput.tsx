import { PictureOutlined } from "@ant-design/icons";
import { useContext, useRef, type ReactNode, type RefObject } from "react";
import { createPortal } from "react-dom";
import type { Language } from "../types";
import { ImageMoleculeDialog } from "./ImageMoleculeDialog";
import type { ImageMolecule } from "./image-molecule";
import { useImageInputSession } from "./useImageInputSession";
import { RecognitionBackendEntry } from "./RecognitionBackendEntry";
import { useRecognitionStatus } from "./recognition-power";
import "./image-molecule.css";
import { TaskPresentationContext } from "../guided/TaskPresentation";

export type ImageInputTarget = "molecule" | "library" | "query";

const imageActions = {
  library: [
    ["上传分子库图片", "Upload library image"],
    ["粘贴分子库图片", "Paste library image"],
  ],
  query: [
    ["上传参照分子图片", "Upload query image"],
    ["粘贴参照分子图片", "Paste query image"],
  ],
} as const;

export function ImageMoleculeInput({
  language,
  enabled = true,
  disabled = false,
  className = "",
  inputOwner = false,
  target = "molecule",
  uploadButton,
  controlsFirst = false,
  automatic = false,
  pasteLabel,
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
  target?: ImageInputTarget;
  uploadButton?: RefObject<HTMLButtonElement | null>;
  controlsFirst?: boolean;
  automatic?: boolean;
  pasteLabel?: string;
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
  const localTrigger = useRef<HTMLButtonElement>(null);
  const trigger = uploadButton ?? localTrigger;
  const surface = useRef<HTMLDivElement>(null);
  const recognition = useRecognitionStatus(enabled && target !== "query");
  const session = useImageInputSession({
    enabled,
    disabled,
    onMolecule,
    trigger,
    onImageSelected,
  });
  const image = enabled ? session.selection : null;
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
      target.closest(".image-molecule-actions,[data-material-disclosure]") ||
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
  const uploadLabel =
    target !== "molecule"
      ? imageActions[target][0][zh ? 0 : 1]
      : automatic
        ? zh
          ? "上传结构图"
          : "Upload structure image"
        : zh
          ? "从结构图片输入"
          : "Input from structure image";
  const controls = (
    <>
      <div className="image-molecule-actions">
        <button
          ref={trigger}
          type="button"
          className="secondary-button"
          aria-label={uploadLabel}
          title={target === "molecule" ? undefined : uploadLabel}
          disabled={session.disabled}
          onClick={() => {
            if (session.choose()) picker.current?.click();
          }}
        >
          {target === "molecule" ? (
            uploadLabel
          ) : (
            <>
              <PictureOutlined
                className="image-source-icon"
                aria-hidden="true"
              />
              <span className="image-source-label">{uploadLabel}</span>
            </>
          )}
        </button>
        <button
          type="button"
          className="text-button"
          disabled={session.disabled}
          onClick={() => void session.paste()}
        >
          {pasteLabel ??
            (target === "molecule"
              ? zh
                ? "粘贴截图"
                : "Paste screenshot"
              : imageActions[target][1][zh ? 0 : 1])}
        </button>
        {target === "molecule" && (
          <span>
            {zh ? "也可直接拖入结构图" : "Or drop a structure image here"}
          </span>
        )}
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
        {enabled && target !== "query" && (
          <RecognitionBackendEntry
            language={language}
            powerControl={recognition}
          />
        )}
      </div>
      <input
        ref={picker}
        type="file"
        hidden
        aria-label={
          target === "molecule"
            ? zh
              ? "选择结构图片"
              : "Choose structure image"
            : imageActions[target][0][zh ? 0 : 1]
        }
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
    </>
  );
  return (
    <div
      ref={surface}
      className={"image-molecule-input " + className}
      data-image-target={target === "molecule" ? undefined : target}
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
      {controlsFirst && controls}
      {children}
      {!controlsFirst && controls}
      {image &&
        createPortal(
          <ImageMoleculeDialog
            key={image.token.id}
            file={image.file}
            language={language}
            disabled={session.disabled}
            automatic={automatic && !image.initialMolecule}
            initialMolecule={image.initialMolecule}
            onClose={() => {
              session.close();
              void recognition.refresh(true);
            }}
            onAccept={async (value, source) => {
              await session.accept(image, value, source);
              void recognition.refresh(true);
            }}
          />,
          document.body,
        )}
    </div>
  );
}
