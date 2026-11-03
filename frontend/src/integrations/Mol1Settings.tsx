import { useState } from "react";
import type { Language } from "../types";
import type { Mol1Settings as Settings } from "./mol1-settings";

export function Mol1Settings({
  value,
  onChange,
  language,
}: {
  value: Settings;
  onChange(value: Settings): void;
  language: Language;
}) {
  const zh = language === "zh";
  const [seedText, setSeedText] = useState(value.additional_seeds.join(","));
  const update = (change: Partial<Settings>) =>
    onChange({ ...value, ...change });
  const numbers = [
    ["samples", "候选构象数", "Structures per seed", 1, 8],
    ["cycles", "结构优化轮数", "Recycling cycles", 1, 50],
    ["steps", "生成精细度（步）", "Diffusion steps", 1, 1000],
  ] as const;
  return (
    <>
      <div className="field-grid">
        {numbers.map(([key, cn, en, min, max]) => (
          <label className="field" key={key}>
            {zh ? cn : en}
            <input
              type="number"
              min={min}
              max={max}
              value={value[key]}
              onChange={(e) => update({ [key]: Number(e.target.value) })}
            />
          </label>
        ))}
      </div>
      <label>
        <input
          type="checkbox"
          checked={value.atom_confidence}
          onChange={(e) => update({ atom_confidence: e.target.checked })}
        />
        {zh
          ? "保留逐原子置信度和 PAE / PDE / 接触概率"
          : "Retain atom confidence, PAE / PDE and contact probabilities"}
      </label>
      <details>
        <summary>{zh ? "专业计算设置" : "Advanced computation"}</summary>
        <label className="field">
          {zh
            ? "额外随机种子（逗号分隔，最多 7 个）"
            : "Additional seeds (comma-separated, up to 7)"}
          <input
            value={seedText}
            onChange={(e) => {
              setSeedText(e.target.value);
              update({
                additional_seeds: e.target.value.trim()
                  ? e.target.value
                      .split(",")
                      .map((token) => (token.trim() ? Number(token) : NaN))
                  : [],
              });
            }}
          />
        </label>
        <label className="field">
          {zh ? "数值精度" : "Numerical precision"}
          <select
            value={value.dtype}
            onChange={(e) =>
              update({ dtype: e.target.value as Settings["dtype"] })
            }
          >
            <option value="bf16">BF16</option>
            <option value="fp32">FP32</option>
          </select>
        </label>
        <label className="field">
          {zh ? "扩散缓存" : "Diffusion cache"}
          <select
            value={value.diffusion_cache_mode}
            onChange={(e) =>
              update({
                diffusion_cache_mode: e.target
                  .value as Settings["diffusion_cache_mode"],
              })
            }
          >
            {["full", "shared", "off"].map((mode) => (
              <option key={mode}>{mode}</option>
            ))}
          </select>
        </label>
        <div className="field-grid">
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
                onChange={(e) => update({ [key]: Number(e.target.value) })}
              />
            </label>
          ))}
        </div>
        <label>
          <input
            type="checkbox"
            checked={value.enable_tf32}
            onChange={(e) => update({ enable_tf32: e.target.checked })}
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
            onChange={(e) => update({ enable_fusion: e.target.checked })}
          />
          {zh ? "原生算子融合" : "Native operator fusion"}
        </label>
      </details>
    </>
  );
}
