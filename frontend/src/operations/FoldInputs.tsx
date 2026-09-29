import type { Language } from "../types";
import { ChainEditor } from "./ScientificInputs";

interface CandidateInput {
  candidate_id: string;
  sequence: string;
  chains: Record<string, string>;
  [key: string]: unknown;
}
export function FoldInputs({
  value,
  onChange,
  language,
}: {
  value: Record<string, unknown>;
  onChange(v: Record<string, unknown>): void;
  language: Language;
}) {
  const zh = language === "zh",
    options = (value.options ?? {}) as Record<string, unknown>;
  const candidates = (value.candidates ?? []) as CandidateInput[];
  return (
    <>
      <ChainEditor
        label={zh ? "目标蛋白" : "Target protein"}
        language={language}
        value={(options.target_chains ?? { A: "" }) as Record<string, string>}
        onChange={(chains) =>
          onChange({
            ...value,
            options: {
              ...options,
              target_chains: chains,
              target_chain_ids: Object.keys(chains),
            },
          })
        }
      />
      {candidates.map((c, i) => (
        <section key={i}>
          <label className="field">
            {zh ? "候选名称" : "Candidate name"}
            <input
              value={c.candidate_id}
              required
              onChange={(e) =>
                onChange({
                  ...value,
                  candidates: candidates.map((x, j) =>
                    j === i ? { ...x, candidate_id: e.target.value } : x,
                  ),
                })
              }
            />
          </label>
          <ChainEditor
            label={zh ? "候选抗体序列" : "Candidate antibody sequences"}
            language={language}
            value={c.chains}
            onChange={(chains) =>
              onChange({
                ...value,
                candidates: candidates.map((x, j) =>
                  j === i
                    ? { ...x, chains, sequence: Object.values(chains).join("") }
                    : x,
                ),
                options: { ...options, binder_chain_ids: Object.keys(chains) },
              })
            }
          />
          <button
            type="button"
            disabled={candidates.length === 1}
            onClick={() =>
              onChange({
                ...value,
                candidates: candidates.filter((_, j) => j !== i),
              })
            }
          >
            {zh ? "删除候选" : "Remove candidate"}
          </button>
        </section>
      ))}
      <button
        type="button"
        disabled={candidates.length >= 64}
        onClick={() =>
          onChange({
            ...value,
            candidates: [
              ...candidates,
              {
                candidate_id: `candidate-${candidates.length + 1}`,
                sequence: "",
                chains: { B: "" },
              },
            ],
          })
        }
      >
        {zh ? "添加候选" : "Add candidate"}
      </button>
    </>
  );
}
