import type { Language } from "../types";
import type { Mol1Settings as Settings } from "./mol1-settings";
import { Mol1SeedEditor } from "./Mol1SeedEditor";
import { Mol1RuntimeSettings } from "./Mol1RuntimeSettings";
import "./mol1-computation-settings.css";

export function Mol1Settings({
  value,
  onChange,
  language,
  seedText,
  onSeedText,
  seed,
  onSeed,
  device,
  onDevice,
  memory,
  onMemory,
}: {
  value: Settings;
  onChange(value: Settings): void;
  language: Language;
  seedText: string;
  onSeedText(value: string): void;
  seed: number;
  onSeed(value: number): void;
  device: "cpu" | "cuda";
  onDevice(value: "cpu" | "cuda"): void;
  memory: number;
  onMemory(value: number): void;
}) {
  const zh = language === "zh";
  const update = (change: Partial<Settings>) =>
    onChange({ ...value, ...change });
  const numbers = [
    ["samples", "候选构象数", "Structures per seed", 1, 8],
    ["cycles", "结构优化轮数", "Recycling cycles", 1, 50],
    ["steps", "生成精细度（步）", "Diffusion steps", 1, 1000],
  ] as const;
  return (
    <div className="mol1-settings">
      <section
        aria-label={zh ? "构象采样" : "Sampling"}
        className="mol1-sampling"
      >
        <h3>{zh ? "构象采样" : "Sampling"}</h3>
        <div className="mol1-setting-grid">
          {numbers.map(([key, cn, en, min, max]) => (
            <label className="field" key={key}>
              {zh ? cn : en}
              <input
                type="number"
                min={min}
                max={max}
                value={value[key]}
                onChange={(event) =>
                  update({ [key]: Number(event.target.value) })
                }
              />
            </label>
          ))}
        </div>
      </section>
      <Mol1SeedEditor
        primary={seed}
        onPrimary={onSeed}
        text={seedText}
        onText={onSeedText}
        language={language}
      />
      <label className="mol1-confidence-choice">
        <input
          type="checkbox"
          checked={value.atom_confidence}
          onChange={(event) =>
            update({ atom_confidence: event.target.checked })
          }
        />
        {zh
          ? "保留逐原子置信度和 PAE / PDE / 接触概率"
          : "Retain atom confidence, PAE / PDE and contact probabilities"}
      </label>
      <Mol1RuntimeSettings
        value={value}
        onChange={onChange}
        language={language}
        device={device}
        onDevice={onDevice}
        memory={memory}
        onMemory={onMemory}
      />
    </div>
  );
}
