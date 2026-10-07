import type { Dispatch, SetStateAction } from "react";
import type { Language } from "../types";
import type { ChannelOptions } from "./types";

export function ChannelExpert({
  language,
  options,
  setOptions,
  chains,
}: {
  language: Language;
  options: ChannelOptions;
  setOptions: Dispatch<SetStateAction<ChannelOptions>>;
  chains: string[];
}) {
  const zh = language === "zh";
  return (
    <details>
      <summary>{zh ? "专家微调" : "Expert settings"}</summary>
      <div className="channel-expert-fields">
        <label className="field">
          {zh ? "探针半径（Å）" : "Probe radius (Å)"}
          <input
            type="number"
            min={0.5}
            max={3}
            step={0.1}
            value={options.probe_radius_angstrom}
            onChange={(e) =>
              setOptions((o) => ({
                ...o,
                probe_radius_angstrom: Number(e.target.value),
              }))
            }
          />
        </label>
        <label className="field">
          {zh ? "路径采样间隔（Å）" : "Profile step (Å)"}
          <select
            value={options.profile_step_angstrom}
            onChange={(e) =>
              setOptions((o) => ({
                ...o,
                profile_step_angstrom: Number(e.target.value) as 0.25 | 0.5 | 1,
              }))
            }
          >
            {[0.25, 0.5, 1].map((n) => (
              <option key={n}>{n}</option>
            ))}
          </select>
        </label>
        <label className="field">
          {zh ? "重复坐标位置" : "Alternate coordinates"}
          <select
            value={options.alternate}
            onChange={(e) =>
              setOptions((o) => ({ ...o, alternate: e.target.value }))
            }
          >
            <option value="A">
              {zh ? "明确选位置 A（默认）" : "Choose location A (default)"}
            </option>
            <option value="B">
              {zh ? "明确选位置 B" : "Choose location B"}
            </option>
            <option value="reject">
              {zh ? "遇到重复坐标时停止" : "Stop on ambiguous coordinates"}
            </option>
          </select>
        </label>
      </div>
      <label className="checkbox-line">
        <input
          type="checkbox"
          checked={options.remove_starting_ligands}
          onChange={(e) =>
            setOptions((o) => ({
              ...o,
              remove_starting_ligands: e.target.checked,
            }))
          }
        />
        {zh
          ? "将起点配体从空间障碍中移除"
          : "Remove starting ligands from obstacles"}
      </label>
      <div>
        <p>
          {zh
            ? "参与分析的链（未勾选时为全部链）"
            : "Context chains (all chains when none are checked)"}
        </p>
        <div className="surface-context-chains">
          {chains.map((chain) => (
            <label className="checkbox-line" key={chain}>
              <input
                type="checkbox"
                checked={options.context_chains.includes(chain)}
                onChange={() =>
                  setOptions((o) => ({
                    ...o,
                    context_chains: o.context_chains.includes(chain)
                      ? o.context_chains.filter((c) => c !== chain)
                      : [...o.context_chains, chain],
                  }))
                }
              />
              {zh ? "链 " : "Chain "}
              {chain}
            </label>
          ))}
        </div>
      </div>
      <p className="field-note">
        {zh
          ? "保留已有重原子，去水并保存新结构版本；缺失原子不自动生成。"
          : "Keep observed heavy atoms, omit water and save a new prepared structure. Missing atoms are not generated."}
      </p>
    </details>
  );
}
