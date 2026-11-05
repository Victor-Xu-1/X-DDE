import { useEffect, useId, useRef, useState } from "react";
import type { Language } from "../types";
import {
  addSeedToken,
  editSeedToken,
  MAX_MOL1_SEEDS,
  removeSeedToken,
  seedTokens,
  validSeedEntries,
  validSeedNumber,
} from "./mol1-seeds";

export function Mol1SeedEditor({
  primary,
  onPrimary,
  text,
  onText,
  language,
}: {
  primary: number;
  onPrimary(value: number): void;
  text: string;
  onText(value: string): void;
  language: Language;
}) {
  const zh = language === "zh",
    id = useId(),
    tokens = seedTokens(text);
  const inputs = useRef(new Map<number, HTMLInputElement>());
  const [focus, setFocus] = useState<number | null>(null);
  useEffect(() => {
    if (focus !== null) {
      inputs.current.get(focus)?.focus();
      setFocus(null);
    }
  }, [focus, text]);
  const register = (index: number) => (element: HTMLInputElement | null) => {
    if (element) inputs.current.set(index, element);
    else inputs.current.delete(index);
  };
  const remove = (index: number) => {
    if (index === 0) {
      onPrimary(Number(tokens[0]));
      onText(removeSeedToken(text, 0));
    } else onText(removeSeedToken(text, index - 1));
    setFocus(Math.min(index, tokens.length - 1));
  };
  const valid = validSeedEntries(primary, text);
  const invalid = [primary, ...tokens.map(Number)].map(
    (value, index, all) =>
      !validSeedNumber(value) ||
      (index > 0 && !tokens[index - 1].trim()) ||
      all.indexOf(value) !== all.lastIndexOf(value),
  );
  return (
    <section className="mol1-seeds" aria-labelledby={`${id}-title`}>
      <header>
        <h3 id={`${id}-title`}>{zh ? "随机种子" : "Seeds"}</h3>
        <span>
          {tokens.length + 1} / {MAX_MOL1_SEEDS}
        </span>
      </header>
      <p id={`${id}-help`} className="field-help">
        {zh
          ? "每个种子独立预测，可生成多个构象。"
          : "Each seed runs independently and can produce multiple structures."}
      </p>
      <ul className="mol1-seed-rows" aria-describedby={`${id}-help`}>
        {[String(primary), ...tokens].map((value, index) => (
          <li key={index}>
            <label htmlFor={`${id}-${index}`}>
              {zh ? `种子 ${index + 1}` : `Seed ${index + 1}`}
            </label>
            <input
              ref={register(index)}
              id={`${id}-${index}`}
              aria-label={
                index === 0
                  ? zh
                    ? "主随机种子"
                    : "Primary seed"
                  : zh
                    ? `种子 ${index + 1}`
                    : `Seed ${index + 1}`
              }
              aria-invalid={invalid[index]}
              aria-describedby={!valid ? `${id}-error` : `${id}-help`}
              type={index === 0 ? "number" : "text"}
              inputMode="numeric"
              min={index === 0 ? 0 : undefined}
              max={index === 0 ? 2147483647 : undefined}
              value={value.trim() ? value : ""}
              onChange={(event) =>
                index === 0
                  ? onPrimary(Number(event.target.value))
                  : onText(editSeedToken(text, index - 1, event.target.value))
              }
            />
            <button
              type="button"
              className="mol1-seed-remove"
              disabled={
                index === 0 &&
                (!tokens.length ||
                  !tokens[0].trim() ||
                  !validSeedNumber(Number(tokens[0])))
              }
              aria-label={
                zh ? `删除种子 ${index + 1}` : `Remove seed ${index + 1}`
              }
              onClick={() => remove(index)}
            >
              ×
            </button>
          </li>
        ))}
      </ul>
      {!valid && (
        <p id={`${id}-error`} className="mol1-seed-error" role="status">
          {zh
            ? "使用 1–8 个不重复的整数（0–2147483647），请补全或删除空白种子。"
            : "Use 1–8 distinct integers (0–2147483647). Complete or remove empty seeds."}
        </p>
      )}
      <button
        type="button"
        className="mol1-seed-add"
        disabled={tokens.length >= MAX_MOL1_SEEDS - 1}
        onClick={() => {
          onText(addSeedToken(primary, text));
          setFocus(tokens.length + 1);
        }}
      >
        <span aria-hidden="true">+</span> {zh ? "添加种子" : "Add seed"}
      </button>
    </section>
  );
}
