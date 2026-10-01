import { useState } from "react";
import type { ReactNode } from "react";
import type { Job, Language } from "../types";
import { Questionnaire } from "./Questionnaire";

export function InspectionSteps({
  language,
  label,
  subject,
  busy,
  error,
  ready = true,
  onSubmit,
}: {
  language: Language;
  label: string;
  subject: ReactNode;
  busy: boolean;
  error: string;
  ready?: boolean;
  onSubmit(): Promise<Job | undefined>;
}) {
  const zh = language === "zh";
  const [open, setOpen] = useState(false);
  if (!open)
    return (
      <button type="button" disabled={busy} onClick={() => setOpen(true)}>
        {label}
      </button>
    );
  return (
    <Questionnaire
      embedded
      language={language}
      busy={busy}
      error={error}
      ready={ready}
      unavailable={
        zh
          ? "请先配置本任务所需环境。"
          : "Configure this task's environment first."
      }
      submitLabel={label}
      onSubmit={onSubmit}
      steps={[
        {
          title: zh ? "确认材料" : "Confirm inputs",
          valid: true,
          content: subject,
        },
        {
          title: zh ? "选择检查" : "Choose inspection",
          valid: true,
          content: (
            <p>
              {zh
                ? "读取真实原子身份与编号"
                : "Read actual atom identities and numbering"}
            </p>
          ),
        },
        {
          title: zh ? "确认范围" : "Confirm scope",
          valid: true,
          content: (
            <p>
              {zh
                ? "仅检查输入；保持原始分子版本。"
                : "Inspect inputs and retain the original molecule version."}
            </p>
          ),
        },
        {
          title: zh ? "确认递交" : "Review & submit",
          valid: true,
          content: (
            <p>
              {zh
                ? "递交后从实际结果中选择原子。"
                : "Select atoms from the actual result after submission."}
            </p>
          ),
        },
      ]}
    />
  );
}
