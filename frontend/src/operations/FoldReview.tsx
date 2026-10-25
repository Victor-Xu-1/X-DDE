import { Fragment } from "react";
import type { Language } from "../types";
import { candidateChains, record } from "./candidate-sequence-model";

function alignmentLabel(
  value: unknown,
  options: Record<string, unknown>,
  zh: boolean,
) {
  const chain = record(value);
  if (options.use_msa === false) return zh ? "仅单条序列" : "Single sequence";
  if (chain.unpairedMsaPath || chain.pairedMsaPath)
    return zh ? "MSA 文件已选" : "MSA file selected";
  if (Object.keys(record(options.target_msa)).length)
    return zh ? "任务级 MSA 设置" : "Task-level MSA settings";
  if (options.enable_msa_search === true)
    return zh ? "已允许搜索比对" : "Alignment search enabled";
  if (options.use_msa === true && options.enable_msa_search === false)
    return zh ? "未提供 MSA；搜索已关闭" : "No supplied MSA; search disabled";
  return zh ? "后端默认设置" : "Backend default";
}

function Chains({
  value,
  options,
  label,
  zh,
}: {
  value: unknown;
  options: Record<string, unknown>;
  label: string;
  zh: boolean;
}) {
  const raw = record(value),
    chains = candidateChains({ chains: value });
  return (
    <table aria-label={label}>
      <thead>
        <tr>
          <th>{zh ? "链" : "Chain"}</th>
          <th>{zh ? "氨基酸数" : "Residues"}</th>
          <th>{zh ? "进化信息" : "Evolutionary information"}</th>
        </tr>
      </thead>
      <tbody>
        {chains.map(({ chain, sequence }) => (
          <tr key={chain}>
            <td>{chain}</td>
            <td>{sequence.replace(/\s/g, "").length}</td>
            <td>{alignmentLabel(raw[chain], options, zh)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/** Summarize only submitted native choices; never imply a successful prediction. */
export function FoldReview({
  payload,
  language,
}: {
  payload: Record<string, unknown>;
  language: Language;
}) {
  const zh = language === "zh",
    options = record(payload.options);
  const candidates = Array.isArray(payload.candidates)
    ? payload.candidates.map(record)
    : [];
  const groups = [
    options.target_chains,
    ...candidates.map((candidate) => candidate.chains),
  ];
  const ignored =
    options.use_msa === false &&
    groups.some((group) =>
      Object.values(record(group)).some((chain) => {
        const value = record(chain);
        return Boolean(value.unpairedMsaPath || value.pairedMsaPath);
      }),
    );
  const sampling = [
    ["diffusion_samples", zh ? "个采样" : "samples"],
    ["diffusion_steps", zh ? "步扩散" : "diffusion steps"],
    ["recycling_cycles", zh ? "轮循环" : "recycles"],
  ].flatMap(([key, label]) => {
    const value = options[key];
    return typeof value === "number" && Number.isSafeInteger(value) && value > 0
      ? [`${value} ${label}`]
      : [];
  });
  const seeds = options.seeds;
  if (
    Array.isArray(seeds) &&
    seeds.length &&
    seeds.every((seed) => Number.isSafeInteger(seed) && seed >= 0)
  )
    sampling.push(`${zh ? "随机种子" : "Seeds"}: ${seeds.join(", ")}`);
  return (
    <>
      <dt>{zh ? "目标蛋白" : "Target protein"}</dt>
      <dd>
        <Chains
          value={options.target_chains}
          options={options}
          label={zh ? "目标蛋白" : "Target protein"}
          zh={zh}
        />
      </dd>
      {candidates.map((candidate, index) => (
        <Fragment key={index}>
          <dt>
            {zh ? "候选" : "Candidate"} {index + 1}
          </dt>
          <dd>
            <strong>{String(candidate.candidate_id ?? "")}</strong>
            <Chains
              value={candidate.chains}
              options={options}
              label={`${zh ? "候选链" : "Candidate chains"} ${index + 1}`}
              zh={zh}
            />
          </dd>
        </Fragment>
      ))}
      {sampling.length > 0 && (
        <>
          <dt>{zh ? "采样设置" : "Sampling settings"}</dt>
          <dd>{sampling.join(" · ")}</dd>
        </>
      )}
      {ignored && (
        <>
          <dt>{zh ? "MSA 使用" : "MSA use"}</dt>
          <dd role="note">
            {zh
              ? "MSA 已关闭：所选 MSA 文件不会用于本次计算。"
              : "MSA is disabled. Supplied MSA files will not be used in this calculation."}
          </dd>
        </>
      )}
    </>
  );
}
