import { useEffect, useState } from "react";

export function IntegerListField({
  value,
  onChange,
  label,
  max,
  count,
}: {
  value: number[];
  onChange(v: number[]): void;
  label: string;
  max: number;
  count: number;
}) {
  const canonical = value.join(", "),
    [text, setText] = useState(canonical);
  useEffect(() => setText(canonical), [canonical]);
  return (
    <label className="field">
      {label}
      <input
        value={text}
        onChange={(e) => {
          const raw = e.target.value;
          setText(raw);
          const parts = raw.split(/[,，\s]+/).filter(Boolean),
            values = parts.map(Number);
          const valid =
            parts.every((s) => /^\d+$/.test(s)) &&
            values.every((n) => Number.isSafeInteger(n) && n <= max) &&
            values.length <= count &&
            new Set(values).size === values.length;
          e.target.setCustomValidity(
            valid ? "" : `Use up to ${count} distinct integers from0 to${max}.`,
          );
          if (valid) onChange(values);
        }}
      />
    </label>
  );
}
