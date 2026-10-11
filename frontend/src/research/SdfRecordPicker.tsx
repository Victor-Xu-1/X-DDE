import { useEffect, useState } from "react";
import type { Language } from "../types";
import type { MoleculeRef } from "./types";
export function SdfRecordPicker({
  base,
  language,
  onChange,
}: {
  base: MoleculeRef;
  language: Language;
  onChange(value: MoleculeRef | null): void;
}) {
  const zh = language === "zh";
  const [draft, setDraft] = useState(String(base.record + 1));
  useEffect(() => setDraft(String(base.record + 1)), [base.record]);
  const number = Number(draft),
    valid =
      draft.trim() !== "" &&
      Number.isInteger(number) &&
      number >= 1 &&
      number <= 500;
  return (
    <label className="field">
      {zh
        ? "SDF 中第几个分子（从 1 开始）"
        : "Molecule record in SDF (starts at 1)"}
      <input
        type="number"
        min={1}
        max={500}
        step={1}
        value={draft}
        aria-invalid={!valid}
        onChange={(event) => {
          const text = event.target.value;
          setDraft(text);
          const record = Number(text);
          onChange(
            text.trim() !== "" &&
              Number.isInteger(record) &&
              record >= 1 &&
              record <= 500
              ? { ...base, record: record - 1 }
              : null,
          );
        }}
      />
      {!valid && (
        <small role="alert">
          {zh
            ? "请填写 1–500 之间的整数。"
            : "Enter a whole number from 1 to 500."}
        </small>
      )}
    </label>
  );
}
