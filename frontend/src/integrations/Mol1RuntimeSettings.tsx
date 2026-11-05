import type { Language } from "../types";
import type { Mol1Settings } from "./mol1-settings";

export function Mol1RuntimeSettings({
  value,
  onChange,
  language,
  device,
  onDevice,
  memory,
  onMemory,
}: {
  value: Mol1Settings;
  onChange(value: Mol1Settings): void;
  language: Language;
  device: "cpu" | "cuda";
  onDevice(value: "cpu" | "cuda"): void;
  memory: number;
  onMemory(value: number): void;
}) {
  const zh = language === "zh";
  const update = (change: Partial<Mol1Settings>) =>
    onChange({ ...value, ...change });
  return (
    <details className="mol1-runtime">
      <summary>{zh ? "专业计算设置" : "Advanced computation"}</summary>
      <div className="mol1-runtime-body">
        <div className="mol1-setting-grid">
          <label className="field">
            {zh ? "计算设备" : "Compute device"}
            <select
              value={device}
              onChange={(event) =>
                onDevice(event.target.value as typeof device)
              }
            >
              <option value="cuda">NVIDIA GPU</option>
              <option value="cpu">CPU</option>
            </select>
          </label>
          <label className="field">
            {zh ? "内存上限（MiB）" : "Memory limit (MiB)"}
            <input
              type="number"
              min={1024}
              max={65536}
              value={memory}
              onChange={(event) => onMemory(Number(event.target.value))}
            />
          </label>
          <label className="field">
            {zh ? "数值精度" : "Numerical precision"}
            <select
              value={value.dtype}
              onChange={(event) =>
                update({ dtype: event.target.value as Mol1Settings["dtype"] })
              }
            >
              <option value="bf16">BF16</option>
              <option value="fp32">FP32</option>
            </select>
          </label>
        </div>
        <div className="mol1-setting-grid">
          {(
            [
              ["attention_chunk", "注意力分块", "Attention chunk", 4096],
              ["msa_chunk", "MSA 分块", "MSA chunk", 4096],
              [
                "sample_chunk",
                "同时生成的构象数",
                "Simultaneous samples",
                value.samples,
              ],
            ] as const
          ).map(([key, cn, en, max]) => (
            <label className="field" key={key}>
              {zh ? cn : en}
              <input
                type="number"
                min={1}
                max={max}
                value={value[key]}
                onChange={(event) =>
                  update({ [key]: Number(event.target.value) })
                }
              />
            </label>
          ))}
        </div>
        <label className="field mol1-cache">
          {zh ? "扩散缓存" : "Diffusion cache"}
          <select
            value={value.diffusion_cache_mode}
            onChange={(event) =>
              update({
                diffusion_cache_mode: event.target
                  .value as Mol1Settings["diffusion_cache_mode"],
              })
            }
          >
            {["full", "shared", "off"].map((mode) => (
              <option key={mode}>{mode}</option>
            ))}
          </select>
        </label>
        <div className="mol1-runtime-toggles">
          <label>
            <input
              type="checkbox"
              checked={value.enable_tf32}
              onChange={(event) =>
                update({ enable_tf32: event.target.checked })
              }
            />
            TF32
          </label>
          <label>
            <input
              type="checkbox"
              checked={value.msa_pair_as_unpair}
              onChange={(event) =>
                update({ msa_pair_as_unpair: event.target.checked })
              }
            />
            {zh
              ? "配对 MSA 同时作为非配对信息 · 原生默认"
              : "Also use paired MSAs as unpaired information · native default"}
          </label>
          <label>
            <input
              type="checkbox"
              checked={value.enable_fusion}
              onChange={(event) =>
                update({ enable_fusion: event.target.checked })
              }
            />
            {zh ? "原生算子融合" : "Native operator fusion"}
          </label>
        </div>
      </div>
    </details>
  );
}
