import { useState, type InputHTMLAttributes } from "react";
import { FileOutlined, UploadOutlined } from "@ant-design/icons";
import type { Language } from "../types";
import "./file-select.css";

type Props = Omit<
  InputHTMLAttributes<HTMLInputElement>,
  "type" | "children"
> & {
  language: Language;
  variant?: "regular" | "compact" | "large";
  title?: string;
  description?: string;
};
/** Presentation only. The real browser input retains files, labels and validation. */
export function FileSelect({
  language,
  variant = "regular",
  title,
  description,
  onChange,
  className = "",
  ...input
}: Props) {
  const zh = language === "zh";
  const [names, setNames] = useState<string[]>([]);
  return (
    <span className={`file-select is-${variant} ${className}`}>
      <span className="file-select-symbol" aria-hidden="true">
        {names.length ? <FileOutlined /> : <UploadOutlined />}
      </span>
      <span className="file-select-copy">
        <strong>
          {names.length
            ? names.join(" · ")
            : (title ?? (zh ? "点击选择文件" : "Choose a file"))}
        </strong>
        {variant !== "compact" && (
          <span>
            {names.length
              ? zh
                ? "点击可更换文件"
                : "Click to choose another file"
              : (description ??
                (input.multiple
                  ? zh
                    ? "可选择多个文件"
                    : "Multiple files allowed"
                  : zh
                    ? "选择一个研究文件"
                    : "Select a research file"))}
          </span>
        )}
      </span>
      <input
        {...input}
        className="file-select-native"
        type="file"
        onChange={(event) => {
          const control = event.currentTarget;
          onChange?.(event);
          // Some editor callers intentionally clear the native value for same-file
          // reopening. Do not keep a stale selected-file label after that clear.
          setNames(Array.from(control.files ?? [], (file) => file.name));
        }}
      />
    </span>
  );
}
