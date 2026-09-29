import { useState } from "react";
import { MetricHelp, metrics } from "../guided/MetricHelp";
import { conformerName } from "./CandidatePanel";
import type { Analysis, Candidate, Language } from "../types";
export function AnalysisGrid({
  analysis,
  candidate,
  language,
  onResidue,
}: {
  analysis: Analysis | null;
  candidate?: Candidate;
  language: Language;
  onResidue?(residue: string): void;
}) {
  const zh = language === "zh",
    [ligandIndex, setLigandIndex] = useState(0),
    ligands = analysis?.ligands ?? [];
  const ligand =
      ligands[Math.min(ligandIndex, Math.max(0, ligands.length - 1))],
    contacts = candidate?.contacts ?? [];
  return (
    <section
      className="analysis-grid"
      aria-label={zh ? "结果解释" : "Result interpretation"}
    >
      <article className="analysis-card property-card">
        <h3>{zh ? "小分子性质" : "Molecular properties"}</h3>
        {ligands.length > 1 && (
          <select
            aria-label={zh ? "选择小分子" : "Select ligand"}
            value={ligandIndex}
            onChange={(e) => setLigandIndex(Number(e.target.value))}
          >
            {ligands.map((_, i) => (
              <option key={i} value={i}>
                {zh ? "小分子" : "Ligand"} {i + 1}
              </option>
            ))}
          </select>
        )}
        {ligand?.available ? (
          <dl className="property-grid">
            {(["mw", "logp", "tpsa", "qed", "sa"] as const).map((key) => (
              <div key={key}>
                <dt>
                  {metrics[key][zh ? 0 : 1]}
                  <MetricHelp metric={key} language={language} />
                </dt>
                <dd>
                  {ligand[key]?.toFixed(
                    key === "mw" || key === "tpsa" ? 1 : 2,
                  ) ?? "—"}
                  {key === "mw" ? " g/mol" : key === "tpsa" ? " Å²" : ""}
                </dd>
              </div>
            ))}
          </dl>
        ) : (
          <p className="analysis-empty">
            {!analysis
              ? zh
                ? "运行完成后显示"
                : "Available after a prediction"
              : ligand
                ? zh
                  ? "此配体使用 CCD 编号；提供 SMILES 后可计算分子性质。"
                  : "This ligand uses a CCD identifier. Use SMILES to calculate descriptors."
                : zh
                  ? "本任务未输入小分子，无需计算此项。"
                  : "No ligand was submitted for this task."}
          </p>
        )}
        <p>
          {zh
            ? "根据输入结构计算，与构象打分分开解读。"
            : "Calculated from the input molecule; separate from conformer confidence."}
        </p>
      </article>
      <article className="analysis-card">
        <h3>{zh ? "如何看这次结果" : "How to read this result"}</h3>
        {candidate ? (
          <div className="result-explanation">
            <strong>{conformerName(candidate.id, zh)}</strong>
            <p>
              {zh ? "综合排序分数" : "Model ranking"}:{" "}
              {candidate.ranking_score?.toFixed(3) ?? "—"}{" "}
              <MetricHelp metric="ranking" language={language} />
            </p>
            <p>
              {zh
                ? "不同构象是同一组输入的结构预测，不是新生成的化合物。先查看形状与邻近残基，再结合实验判断。"
                : "Conformers predict structures for the same inputs; they are not newly generated compounds. Inspect geometry and nearby residues, then interpret alongside experiments."}
            </p>
            {analysis && analysis.candidates.length > 1 && (
              <p>
                {zh
                  ? "勾选右侧构象可叠加。RMSD 表示对齐后的形状差异。"
                  : "Check conformers to overlay them. RMSD describes geometric differences after alignment."}
                <MetricHelp metric="rmsd" language={language} />
              </p>
            )}
          </div>
        ) : (
          <p className="analysis-empty">
            {zh
              ? "选择一个已完成任务，即可查看结果解释。"
              : "Select a completed task to read its results."}
          </p>
        )}
      </article>
      <article className="analysis-card contact-card">
        <h3>
          {zh ? "配体附近的残基" : "Nearby residues"}{" "}
          <MetricHelp metric="contacts" language={language} />
        </h3>
        {contacts.length ? (
          <ol>
            {contacts.slice(0, 8).map((contact) => (
              <li key={contact.residue}>
                {onResidue ? (
                  <button
                    onClick={() => onResidue(contact.residue)}
                    title={
                      zh ? "在三维图中定位此残基" : "Locate this residue in 3D"
                    }
                  >
                    {contact.residue}
                  </button>
                ) : (
                  <span>{contact.residue}</span>
                )}
                <strong>{contact.distance.toFixed(2)} Å</strong>
              </li>
            ))}
          </ol>
        ) : (
          <p className="analysis-empty">
            {candidate
              ? zh
                ? "未检测到 4 Å 内的蛋白–配体近邻接触。"
                : "No protein–ligand contacts within 4 Å were found."
              : zh
                ? "复合物预测完成后显示。"
                : "Available after a complex prediction."}
          </p>
        )}
        <p>
          {zh
            ? "点击残基在预览中定位；距离接近不等于氢键。"
            : "Click a residue to locate it. Proximity does not establish a hydrogen bond."}
        </p>
      </article>
    </section>
  );
}
