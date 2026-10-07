import { useEffect, useState } from "react";
import { Hint } from "../guided/Hint";
import type { Language } from "../types";
export function AtomMapping({
  value,
  onChange,
  onValid,
  language,
}: {
  value: number[];
  onChange(value: number[]): void;
  onValid(valid: boolean): void;
  language: Language;
}) {
  const zh = language === "zh",
    serialized = value.map((i) => i + 1).join(", ");
  const [text, setText] = useState(serialized),
    [invalid, setInvalid] = useState(false);
  useEffect(() => {
    setText(serialized);
    setInvalid(false);
  }, [serialized]);
  return (
    <details className="proximity-expert">
      <summary>
        {zh ? "专家：指定原子对应关系" : "Expert: explicit atom correspondence"}
      </summary>
      <label className="proximity-mapping">
        {zh ? "完整分子中的原子序号" : "Atom numbers in the complete molecule"}
        <Hint
          label={zh ? "如何填写对应关系？" : "How to specify correspondence?"}
        >
          {zh
            ? "通常留空，执行时检查唯一的化学对应。若片段存在多个对称匹配，按片段 SDF 中重原子的原始顺序，填写它们在完整 SDF 中的原始原子序号（从 1 开始）。不能按空间距离猜测。"
            : "Usually leave empty for unique chemical correspondence. For symmetric matches, list original full-SDF atom numbers (starting at 1) in the fragment's original heavy-atom order. Spatial proximity is not an atom mapping."}
        </Hint>
        <input
          value={text}
          aria-invalid={invalid}
          placeholder={
            zh ? "留空：唯一化学对应" : "Empty: unique chemical correspondence"
          }
          onChange={(e) => {
            const next = e.target.value;
            setText(next);
            const tokens = next.trim()
              ? next.split(/[,\s]+/).filter(Boolean)
              : [];
            const numbers = tokens.map(Number);
            const valid =
              !tokens.length ||
              (tokens.length >= 3 &&
                tokens.length <= 256 &&
                tokens.every((n) => /^\d+$/.test(n)) &&
                numbers.every(
                  (n) => Number.isSafeInteger(n) && n > 0 && n <= 1000000,
                ) &&
                new Set(numbers).size === numbers.length);
            setInvalid(!valid);
            onValid(valid);
            if (valid) onChange(numbers.map((n) => n - 1));
          }}
        />
      </label>
      {invalid && (
        <p role="alert" className="field-note">
          {zh
            ? "请填写至少三个不重复的正整数序号，或清空使用唯一化学对应。"
            : "Enter at least three distinct positive atom numbers, or leave empty for unique chemical correspondence."}
        </p>
      )}
    </details>
  );
}
