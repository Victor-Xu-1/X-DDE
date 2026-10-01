import { useEffect, useId, useState } from "react";
export function JsonEditor({
  value,
  onChange,
  label,
}: {
  value: unknown;
  onChange(v: Record<string, unknown>): void;
  label: string;
}) {
  const errorId = useId();
  const serialized = JSON.stringify(value, null, 2),
    [text, setText] = useState(serialized),
    [error, setError] = useState("");
  useEffect(() => {
    if (!error) setText(serialized);
  }, [serialized]);
  return (
    <label className="field">
      {label}
      <textarea
        aria-label={label}
        aria-invalid={Boolean(error)}
        aria-describedby={error ? errorId : undefined}
        rows={12}
        spellCheck={false}
        value={text}
        onChange={(e) => {
          setText(e.target.value);
          try {
            const parsed = JSON.parse(e.target.value);
            if (!parsed || typeof parsed !== "object" || Array.isArray(parsed))
              throw new Error("Enter a JSON object");
            setError("");
            e.target.setCustomValidity("");
            onChange(parsed);
          } catch (err) {
            setError(String(err));
            e.target.setCustomValidity(String(err));
          }
        }}
      />
      {error && (
        <span id={errorId} role="alert">
          {error}
        </span>
      )}
    </label>
  );
}
