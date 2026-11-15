import { useEffect, useRef, useState, type ReactNode } from "react";
import type { Language } from "../types";
import { ImageMoleculeDialog } from "./ImageMoleculeDialog";
import { validImage, type ImageMolecule } from "./image-molecule";
import "./image-molecule.css";

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
  const zh = language === "zh",
    picker = useRef<HTMLInputElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const mounted = useRef(true);
  const applying = useRef<AbortController | null>(null),
    intent = useRef(0);
  const current = useRef({ enabled, disabled });
  current.current = { enabled, disabled };
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      intent.current++;
      applying.current?.abort();
    };
  }, []);
  const [file, setFile] = useState<File | null>(null),
    [error, setError] = useState("");
  function select(image: File) {
    if (
      !mounted.current ||
      current.current.disabled ||
      !current.current.enabled ||
      trigger.current?.closest("[hidden]")
    )
      return;
    if (!validImage(image)) {
      setError(
        zh
          ? "请选择不超过 10 MB 的 PNG、JPEG、WebP 或 BMP 图片。"
          : "Use a PNG, JPEG, WebP or BMP image up to 10 MB.",
      );
      return;
    }
    setError("");
    intent.current++;
    applying.current?.abort();
    setFile(image);
  }
  function close() {
    intent.current++;
    applying.current?.abort();
    setFile(null);
    trigger.current?.focus();
  }
  if (!enabled) return <>{children}</>;
  return (
    <div
      className="image-molecule-input"
      onPaste={(event) => {
        const image = Array.from(event.clipboardData.files).find((item) =>
          item.type.startsWith("image/"),
        );
        if (image && !disabled) {
          event.preventDefault();
          event.stopPropagation();
          select(image);
        }
      }}
      onDragOver={(event) => {
        if (
          !disabled &&
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
        if (image && !disabled) {
          event.preventDefault();
          event.stopPropagation();
          select(image);
        }
      }}
    >
      {children}
      <div className="image-molecule-actions">
        <button
          ref={trigger}
          type="button"
          className="secondary-button"
          disabled={disabled}
          onClick={() => picker.current?.click()}
        >
          {zh ? "从结构图片输入" : "Input from structure image"}
        </button>
        <button
          type="button"
          className="text-button"
          disabled={disabled}
          onClick={async () => {
            try {
              for (const item of await navigator.clipboard.read()) {
                const type = item.types.find((value) =>
                  value.startsWith("image/"),
                );
                if (type) {
                  select(
                    new File([await item.getType(type)], "clipboard.png", {
                      type,
                    }),
                  );
                  return;
                }
              }
              setError(
                zh ? "剪贴板中没有图片。" : "No image in the clipboard.",
              );
            } catch {
              setError(
                zh
                  ? "请在此处按 Ctrl+V 粘贴，或拖入图片。"
                  : "Press Ctrl+V here, or drop an image.",
              );
            }
          }}
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
        disabled={disabled}
        onChange={(event) => {
          const image = event.target.files?.[0];
          event.target.value = "";
          if (image) select(image);
        }}
      />
      {error && (
        <p role="alert" className="error-box">
          {error}
        </p>
      )}
      {file && (
        <ImageMoleculeDialog
          key={file.name + file.lastModified}
          file={file}
          language={language}
          onClose={close}
          onAccept={async (molecule, source) => {
            const currentIntent = intent.current,
              controller = new AbortController();
            applying.current?.abort();
            applying.current = controller;
            await onMolecule(molecule, source, controller.signal);
            if (
              mounted.current &&
              intent.current === currentIntent &&
              !controller.signal.aborted
            )
              close();
          }}
        />
      )}
    </div>
  );
}
