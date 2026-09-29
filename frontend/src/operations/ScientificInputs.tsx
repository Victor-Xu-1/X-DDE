import { useEffect, useState } from "react";
import type { Language } from "../types";
import { Hint } from "../guided/Hint";

export function parsePositions(text: string, max = 10000): number[] {
  if (!text.trim()) return [];
  const positions = new Set<number>();
  for (const segment of text.split(/[,，\s]+/).filter(Boolean)) {
    const match = /^(\d+)(?:[-:](\d+))?$/.exec(segment);
    if (!match) throw new Error("Use positions such as 1, 5-10");
    const first = Number(match[1]),
      last = Number(match[2] ?? match[1]);
    if (first < 1 || last < first || last > max)
      throw new Error(`Positions must be within 1–${max}`);
    for (let p = first; p <= last; p++) positions.add(p - 1);
  }
  return [...positions].sort((a, b) => a - b);
}

export function PositionInput({
  value,
  onChange,
  label,
  max = 10000,
}: {
  value: number[];
  onChange(v: number[]): void;
  label: string;
  max?: number;
}) {
  const canonical = value.map((n) => n + 1).join(",");
  const [text, setText] = useState(canonical);
  useEffect(() => {
    try {
      if (JSON.stringify(parsePositions(text, max)) !== JSON.stringify(value))
        setText(canonical);
    } catch {
      /* Preserve the invalid text until the user corrects it. */
    }
  }, [canonical]);
  return (
    <label className="field">
      {label}
      <input
        value={text}
        placeholder="1, 5-10"
        onChange={(e) => {
          const raw = e.target.value;
          setText(raw);
          try {
            const parsed = parsePositions(raw, max);
            e.target.setCustomValidity("");
            onChange(parsed);
          } catch (error) {
            e.target.setCustomValidity(String(error));
          }
        }}
      />
    </label>
  );
}

export function ChainEditor({
  value,
  onChange,
  language,
  label,
}: {
  value: Record<string, string>;
  onChange(v: Record<string, string>): void;
  language: Language;
  label: string;
}) {
  const zh = language === "zh",
    entries = Object.entries(value);
  return (
    <section className="chain-editor">
      <h4>{label}</h4>
      {entries.map(([chain, sequence], i) => (
        <div className="chain-entry" key={i}>
          <label>
            {zh ? "链" : "Chain"}
            <input
              value={chain}
              maxLength={8}
              required
              pattern="[A-Za-z0-9]+"
              onChange={(e) => {
                if (e.target.value in value && e.target.value !== chain) {
                  e.target.setCustomValidity(
                    zh ? "链名重复" : "Duplicate chain ID",
                  );
                  return;
                }
                e.target.setCustomValidity("");
                onChange(
                  Object.fromEntries(
                    entries.map(([c, s]) => [
                      c === chain ? e.target.value : c,
                      s,
                    ]),
                  ),
                );
              }}
            />
          </label>
          <label className="field">
            {zh ? "蛋白序列" : "Protein sequence"}
            <textarea
              value={sequence}
              maxLength={10000}
              rows={3}
              required
              spellCheck={false}
              onChange={(e) =>
                onChange({
                  ...value,
                  [chain]: e.target.value.replace(/\s/g, "").toUpperCase(),
                })
              }
            />
          </label>
          <button
            type="button"
            disabled={entries.length <= 1}
            onClick={() =>
              onChange(Object.fromEntries(entries.filter(([c]) => c !== chain)))
            }
          >
            {zh ? "删除链" : "Remove chain"}
          </button>
        </div>
      ))}
      <button
        type="button"
        disabled={entries.length >= 8}
        onClick={() => {
          const id = "ABCDEFGHIJKLMNOPQRSTUVWXYZ"
            .split("")
            .find((c) => !(c in value));
          if (id) onChange({ ...value, [id]: "" });
        }}
      >
        {zh ? "添加链" : "Add chain"}
      </button>
    </section>
  );
}

export function MutablePositions({
  chains,
  value,
  onChange,
  language,
}: {
  chains: Record<string, string>;
  value: Record<string, number[]>;
  onChange(v: Record<string, number[]>): void;
  language: Language;
}) {
  const zh = language === "zh";
  return (
    <section>
      <h4>
        {zh ? "允许改变哪些位置？" : "Which positions may change?"}
        <Hint label={zh ? "位置说明" : "Position help"}>
          {zh
            ? "此处按序列从 1 编号，点击残基选择；提交时自动转换为 Harness 的零起始编号。未选择的位置保持不变。"
            : "Positions here start at 1. Click residues to select; submission converts to Harness zero-based indices. Unselected positions remain fixed."}
        </Hint>
      </h4>
      {Object.entries(chains).map(([chain, sequence]) => (
        <div key={chain}>
          <PositionInput
            label={`${zh ? "链" : "Chain"} ${chain}`}
            value={value[chain] ?? []}
            max={sequence.length || 10000}
            onChange={(v) => onChange({ ...value, [chain]: v })}
          />
          <details>
            <summary>
              {zh ? "点击序列选择位置" : "Select positions in the sequence"}
            </summary>
            <div className="sequence-picker">
              {sequence.split("").map((aa, i) => (
                <button
                  type="button"
                  key={i}
                  aria-pressed={value[chain]?.includes(i) ?? false}
                  title={`${chain}:${i + 1} ${aa}`}
                  onClick={() =>
                    onChange({
                      ...value,
                      [chain]: value[chain]?.includes(i)
                        ? value[chain].filter((n) => n !== i)
                        : [...(value[chain] ?? []), i].sort((a, b) => a - b),
                    })
                  }
                >
                  <small>{i + 1}</small>
                  {aa}
                </button>
              ))}
            </div>
          </details>
        </div>
      ))}
    </section>
  );
}

export function JsonEditor({
  value,
  onChange,
  label,
}: {
  value: unknown;
  onChange(v: Record<string, unknown>): void;
  label: string;
}) {
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
      {error && <span role="alert">{error}</span>}
    </label>
  );
}
