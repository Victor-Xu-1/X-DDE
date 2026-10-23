import type { Language } from "../types";
import { candidateChains } from "./candidate-sequence-model";

type Chain = { chain: string; sequence: string };
function signature(chains: Chain[]) {
  if (
    !chains.length ||
    new Set(chains.map((item) => item.chain)).size !== chains.length
  )
    return null;
  return JSON.stringify(
    [...chains].sort((a, b) => a.chain.localeCompare(b.chain)),
  );
}

/** Counts describe native samples; no deduplication or reranking changes the result. */
export function SequenceProposalSummary({
  candidates,
  parent,
  selected,
  language,
}: {
  candidates: Record<string, unknown>[];
  parent: Record<string, unknown>;
  selected: number;
  language: Language;
}) {
  const zh = language === "zh";
  const chains = candidates.map(candidateChains);
  const keys = chains.map(signature);
  const known = keys.every((key) => key !== null);
  const parents = Object.entries(parent).flatMap(([chain, sequence]) =>
    typeof sequence === "string" && sequence.length
      ? [{ chain, sequence }]
      : [],
  );
  const original =
    parents.length === Object.keys(parent).length ? signature(parents) : null;
  const chainNames = (values: Chain[]) =>
    JSON.stringify(values.map((item) => item.chain).sort());
  const comparable =
    original !== null &&
    known &&
    chains.every((values) => chainNames(values) === chainNames(parents));
  const distinct = new Set(keys);
  const key = keys[selected];
  const copies = key == null ? 0 : keys.filter((value) => value === key).length;
  return (
    <section aria-label={zh ? "序列多样性" : "Sequence diversity"}>
      <div className="dataset-review-strip">
        <div>
          <span>{zh ? "原生采样" : "Native samples"}</span>
          <strong>{candidates.length}</strong>
        </div>
        <div>
          <span>{zh ? "不同序列" : "Distinct sequences"}</span>
          <strong>{known ? distinct.size : "—"}</strong>
        </div>
        {comparable && (
          <div>
            <span>{zh ? "不同突变体" : "Distinct changed variants"}</span>
            <strong>
              {[...distinct].filter((value) => value !== original).length}
            </strong>
          </div>
        )}
      </div>
      {copies > 1 && (
        <p role="status">
          {zh
            ? `所选序列出现在 ${copies} 次原生采样中；每次原始分数均保留。`
            : `This sequence appears in ${copies} native samples; every original score is retained.`}
        </p>
      )}
      {original !== null && key === original && (
        <p role="status">
          {zh
            ? "所选序列与起始序列相同，可作参照，不计为新突变体。"
            : "This sequence matches the parent; use it as a reference, not a new variant."}
        </p>
      )}
    </section>
  );
}
