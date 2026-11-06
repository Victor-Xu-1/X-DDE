import { ChoiceCards } from "../guided/ChoiceCards";
import type { Language } from "../types";

/** Compact source switch; the parent remains the only material-selection owner. */
export function ReferencePickerHeading({
  label,
  source,
  onChange,
  language,
}: {
  label: string;
  source: "saved" | "file";
  onChange(value: "saved" | "file"): void;
  language: Language;
}) {
  const zh = language === "zh";
  return (
    <header className="reference-material-heading">
      <h3 className="input-purpose">{label}</h3>
      <ChoiceCards<"saved" | "file">
        label={label}
        value={source}
        onChange={onChange}
        options={[
          { value: "file", title: zh ? "上传新文件" : "Upload a new file" },
          { value: "saved", title: zh ? "历史文件" : "Historical files" },
        ]}
      />
    </header>
  );
}
