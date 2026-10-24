import type { Language } from "../types";
import type { TernaryExecution } from "./execution";

export function ExecutionSettings({
  value,
  onChange,
  language,
}: {
  value: TernaryExecution;
  onChange(value: TernaryExecution): void;
  language: Language;
}) {
  const zh = language === "zh";
  const memories = [
    ...new Set([4096, 6144, 8192, 12288, 16384, value.memory_mib]),
  ].sort((a, b) => a - b);
  return (
    <>
      <label>
        {zh ? "CPU 线程" : "CPU threads"}
        <select
          value={value.cpu}
          onChange={(e) => onChange({ ...value, cpu: Number(e.target.value) })}
        >
          {[1, 2, 3, 4].map((cpu) => (
            <option key={cpu} value={cpu}>
              {cpu}
            </option>
          ))}
        </select>
      </label>
      <label>
        {zh ? "内存上限（GiB）" : "Memory limit (GiB)"}
        <select
          value={value.memory_mib}
          onChange={(e) =>
            onChange({ ...value, memory_mib: Number(e.target.value) })
          }
        >
          {memories.map((memory) => (
            <option key={memory} value={memory}>
              {memory / 1024} GiB
            </option>
          ))}
        </select>
      </label>
      <label>
        {zh ? "随机种子" : "Random seed"}
        <input
          type="number"
          min={0}
          max={2147483647}
          step={1}
          value={value.seed}
          onChange={(e) => onChange({ ...value, seed: Number(e.target.value) })}
        />
      </label>
    </>
  );
}
