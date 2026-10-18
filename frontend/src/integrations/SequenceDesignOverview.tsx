import type { SequenceDesignResult } from "./sequence-design";

export function SequenceDesignOverview({
  result,
  selected,
  zh,
}: {
  result: SequenceDesignResult;
  selected: string;
  zh: boolean;
}) {
  const active = result.candidates.find(
    (value) => value.candidate_id === selected,
  );
  return (
    <section aria-label={zh ? "序列设计核对" : "Sequence design review"}>
      <div className="dataset-review-strip">
        <div>
          <span>{zh ? "采样数" : "Samples"}</span>
          <strong>{result.sample_count}</strong>
        </div>
        <div>
          <span>{zh ? "不同序列" : "Distinct sequences"}</span>
          <strong>{result.unique_sequence_count}</strong>
        </div>
        <div>
          <span>{zh ? "未改变的样本" : "Wild-type samples"}</span>
          <strong>{result.wild_type_samples}</strong>
        </div>
        <div>
          <span>{zh ? "配体评分覆盖位点" : "Sites in ligand score"}</span>
          <strong>
            {result.native_ligand_scored_residues} /{" "}
            {result.selected_residues.length}
          </strong>
        </div>
      </div>
      <p>
        {active?.mutations.length
          ? active.mutations
              .map(
                (value) =>
                  `${value.residue}: ${value.original} → ${value.designed}`,
              )
              .join(" · ")
          : zh
            ? "序列未改变"
            : "Unchanged sequence"}
        {active && active.first_identical_sample !== selected && (
          <span className="muted">
            {" "}
            · {zh ? "与此样本序列相同：" : "Same sequence as "}
            {active.first_identical_sample}
          </span>
        )}
      </p>
      {!result.native_ligand_scored_residues && (
        <p role="note" className="notice">
          {zh
            ? "所选位点均不在原生配体评分范围内，不能将空评分掩码产生的数值视为高可信结合证据。"
            : "No selected site contributes to the native ligand-neighborhood score; an empty score mask is not high-confidence binding evidence."}
        </p>
      )}
      <details>
        <summary>{zh ? "位点与解释" : "Sites and interpretation"}</summary>
        <table className="compact-table">
          <thead>
            <tr>
              <th>{zh ? "原始位点" : "Original site"}</th>
              <th>
                {zh
                  ? "距参考配体最近重原子（Å）"
                  : "Nearest reference-ligand heavy atom (Å)"}
              </th>
            </tr>
          </thead>
          <tbody>
            {result.selected_residues.map((value) => (
              <tr key={value.identity}>
                <th>
                  {value.identity} · {value.amino_acid}
                </th>
                <td>{value.minimum_ligand_distance_A?.toFixed(2) ?? "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p>
          {zh
            ? "模型似然是固定结构环境下的条件分数，不代表亲和力、药效或突变后的实验稳定性。"
            : "Model likelihood is conditional on the supplied structure; it is not affinity, efficacy or measured mutant stability."}
        </p>
      </details>
    </section>
  );
}
