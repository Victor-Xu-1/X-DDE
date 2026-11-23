import { useEffect, useState, type ReactNode } from "react";
import { PictureOutlined } from "@ant-design/icons";
import type { Language } from "../types";
import type { ImageInputTarget } from "./ImageMoleculeInput";

/** Local-only preview, using the application's existing data-image CSP. */
export function UtilityImagePad({
  language,
  target,
  file,
  children,
}: {
  language: Language;
  target: ImageInputTarget;
  file?: File;
  children: ReactNode;
}) {
  const [preview, setPreview] = useState<{ file: File; url: string }>();
  useEffect(() => {
    if (!file) {
      setPreview(undefined);
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === "string")
        setPreview({ file, url: reader.result });
    };
    reader.readAsDataURL(file);
    return () => {
      reader.onload = null;
      if (reader.readyState === FileReader.LOADING) reader.abort();
    };
  }, [file]);
  const zh = language === "zh";
  const labels = {
    molecule: zh ? "结构截图" : "Structure image",
    library: zh ? "待筛选结构" : "Library structure",
    query: zh ? "参照结构" : "Query structure",
  };
  const source = preview?.file === file ? preview?.url : undefined;
  return (
    <div
      className="utility-image-pad"
      data-utility-image-target={target}
      role="group"
      tabIndex={0}
      aria-label={labels[target]}
    >
      <div className="utility-image-pad-preview">
        {source ? (
          <img src={source} alt={labels[target]} />
        ) : (
          <>
            <PictureOutlined aria-hidden="true" />
            <strong>
              {target === "molecule"
                ? zh
                  ? "粘贴或拖入结构截图"
                  : "Paste or drop a structure image"
                : labels[target]}
            </strong>
          </>
        )}
      </div>
      {children}
    </div>
  );
}
