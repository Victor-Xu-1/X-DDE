import type { DELExecution } from "./del-template";

export function DELExecutionSettings({
  value,
  onChange,
  zh,
}: {
  value: DELExecution;
  onChange(value: DELExecution): void;
  zh: boolean;
}) {
  const field = (
    key: "cpu" | "memory_mib" | "seed",
    label: string,
    min: number,
    max: number,
  ) => (
    <label className="field" key={key}>
      {label}
      <input
        type="number"
        min={min}
        max={max}
        step={1}
        value={value.options[key]}
        onChange={(e) =>
          onChange({
            ...value,
            options: { ...value.options, [key]: Number(e.target.value) },
          })
        }
      />
    </label>
  );
  return (
    <details className="dataset-expert">
      <summary>{zh ? "计算资源" : "Compute resources"}</summary>
      <div className="dataset-field-grid">
        {field("cpu", zh ? "CPU 核心" : "CPU cores", 1, 16)}
        {field(
          "memory_mib",
          zh ? "内存上限（MiB）" : "Memory limit (MiB)",
          1024,
          65536,
        )}
        {field("seed", zh ? "随机种子" : "Random seed", 0, 2147483647)}
        <label className="field">
          {zh ? "最长运行时间（秒）" : "Time limit (seconds)"}
          <input
            type="number"
            min={60}
            max={604800}
            step={1}
            value={value.time_limit_seconds}
            onChange={(e) =>
              onChange({ ...value, time_limit_seconds: Number(e.target.value) })
            }
          />
        </label>
        <label className="field">
          {zh ? "输出上限（GiB）" : "Output limit (GiB)"}
          <input
            type="number"
            min={1}
            max={200}
            step={1}
            value={value.output_bytes / 1024 ** 3}
            onChange={(e) =>
              onChange({
                ...value,
                output_bytes: Number(e.target.value) * 1024 ** 3,
              })
            }
          />
        </label>
      </div>
    </details>
  );
}
