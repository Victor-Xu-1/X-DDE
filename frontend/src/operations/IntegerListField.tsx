import { useEffect, useRef, useState } from "react";
import type { Language } from "../types";
import { readIntegerList } from "./integer-list-model";

export function IntegerListField({
  value,
  onChange,
  label,
  max,
  count,
  text,
  onTextChange,
  language = "en",
}: {
  value: number[];
  onChange(v: number[]): void;
  label: string;
  max: number;
  count: number;
  text?: string;
  onTextChange?(value: string): void;
  language?: Language;
}) {
  const canonical = value.join(", "),
    [localText, setLocalText] = useState(canonical);
  const input = useRef<HTMLInputElement>(null);
  const displayed = text ?? localText;
  useEffect(() => {
    if (text === undefined) setLocalText(canonical);
  }, [canonical, text]);
  useEffect(() => {
    input.current?.setCustomValidity(
      readIntegerList(displayed, max, count).valid
        ? ""
        : language === "zh"
          ? `请填写最多 ${count} 个互不重复的整数，范围为 0 至 ${max}。`
          : `Use up to ${count} distinct integers from 0 to ${max}.`,
    );
  }, [displayed, max, count, language]);
  return (
    <label className="field">
      {label}
      <input
        ref={input}
        maxLength={1000}
        value={displayed}
        onChange={(e) => {
          const raw = e.target.value;
          setLocalText(raw);
          onTextChange?.(raw);
          const { valid, values } = readIntegerList(raw, max, count);
          if (valid) onChange(values);
        }}
      />
    </label>
  );
}
