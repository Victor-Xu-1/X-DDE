import type { Language } from "../types";
import { interactionNames } from "../integrations/InteractionResults";
import type { PredictionReferenceEvidence } from "./PredictionReferenceEvidence";
import "./prediction-reference-review.css";

export function PredictionReferenceReview({
  evidence,
  language,
  onSelect,
}: {
  evidence: PredictionReferenceEvidence;
  language: Language;
  onSelect(id: string): void;
}) {
  const zh = language === "zh";
  const conflict = evidence.omittedDomainClash;
  return (
    <section
      className="prediction-reference-review"
      aria-label={zh ? "实验受体对照" : "Experimental receptor comparison"}
    >
      <header>
        <div>
          <h3>{zh ? "实验受体对照" : "Experimental receptor comparison"}</h3>
          <span className="prediction-reference-sample">
            {evidence.candidate}
          </span>
        </div>
        <a
          href="https://www.rcsb.org/structure/9BIG"
          target="_blank"
          rel="noreferrer"
        >
          9BIG ↗
        </a>
      </header>
      <div
        className={
          "prediction-reference-finding" + (conflict ? " is-conflict" : "")
        }
      >
        <strong>
          {conflict
            ? zh
              ? "与省略的受体结构域冲突"
              : "Clashes with omitted receptor domains"
            : zh
              ? "省略结构域对照未见重原子冲突"
              : "No heavy-atom clash in omitted domains"}
        </strong>
        <p>
          {conflict
            ? zh
              ? "与 9BIG 实验结构对照后，该配体与预测范围外的受体结构域发生冲突。"
              : "Comparison with 9BIG places this ligand against receptor domains outside the modeled construct."
            : zh
              ? "匹配的 109 个 Cα 原子 RMSD 为 0.633 Å。采用刚性的实验 SH2 构象时，局部仍有碰撞。"
              : "The 109 matched Cα atoms align at 0.633 Å RMSD. Local clashes remain against the rigid experimental SH2 domain."}
        </p>
      </div>
      {conflict ? (
        <button
          type="button"
          className="secondary-button"
          onClick={() => onSelect(evidence.reviewedCandidate)}
        >
          {zh ? "查看复核构象 003" : "Inspect reviewed sample 003"}
        </button>
      ) : (
        <>
          {evidence.contacts && (
            <table
              aria-label={zh ? "已核对的 PLIP 接触" : "Verified PLIP contacts"}
            >
              <thead>
                <tr>
                  <th scope="col">{zh ? "模型残基" : "Model residue"}</th>
                  <th scope="col">{zh ? "相互作用" : "Interaction"}</th>
                  <th scope="col">{zh ? "距离 Å" : "Distance Å"}</th>
                </tr>
              </thead>
              <tbody>
                {evidence.contacts.map((row, index) => (
                  <tr key={index}>
                    <th scope="row">
                      {row.chain}:{row.residue}
                      {row.number}
                    </th>
                    <td>
                      {row.kind === "hydrogen_bond"
                        ? zh
                          ? "候选氢键"
                          : "Hydrogen-bond candidate"
                        : (interactionNames[row.kind]?.[zh ? 0 : 1] ??
                          row.kind)}
                    </td>
                    <td>{row.distance.toFixed(2)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          {evidence.contacts?.some((row) => row.kind === "hydrogen_bond") && (
            <p>
              {zh
                ? "GLN74（STAT6 全长 Q590）的候选氢键较弱，且依赖接触几何。"
                : "The GLN74 (full-length STAT6 Q590) hydrogen-bond candidate is weak and geometry-dependent."}
            </p>
          )}
          {evidence.contactJob ? (
            <a
              href={"/#task=" + encodeURIComponent(evidence.contactJob)}
              target="_blank"
              rel="noopener"
            >
              {zh ? "查看原始 PLIP 报告" : "View original PLIP report"}
            </a>
          ) : (
            <p role="status">
              {evidence.contactsPending
                ? zh
                  ? "正在核对原始接触…"
                  : "Verifying native contacts…"
                : zh
                  ? "接触报告暂不可核验。"
                  : "The contact report could not be verified."}
            </p>
          )}
        </>
      )}
      <p className="prediction-reference-scope">
        {zh
          ? "9BIG 含有另一种配体。该对照用于评估几何可行性，亲和力需实验测定。"
          : "9BIG contains a different ligand. This comparison assesses geometric plausibility. Affinity requires experimental measurement."}
      </p>
    </section>
  );
}
