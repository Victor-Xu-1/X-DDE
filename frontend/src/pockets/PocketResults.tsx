import { useState } from "react";
import type { Job, Language } from "../types";
import type { PocketResult, Site } from "./types";
import { StructureViewer } from "../viewer/StructureViewer";
import { DiffForm } from "../diffsbdd/DiffForm";
import { artifactUrl } from "../api";
export function PocketResults({
  job,
  result,
  language,
}: {
  job: Job;
  result: PocketResult;
  language: Language;
}) {
  const zh = language === "zh",
    [selected, setSelected] = useState<Site | null>(null),
    [continueDesign, setContinue] = useState(false),
    [message, setMessage] = useState("");
  const usable =
    result.protein_artifact.endsWith(".pdb") &&
    !!selected?.residues.length &&
    selected.residues.every(
      (r) => r.chain.length === 1 && !r.insertion_code && !r.alternate_location,
    );
  return (
    <section className="operation-results">
      <p className="notice">
        {zh
          ? "保留多个位点假设。原生位点概率不是药物结合概率，不能替代对接、结合模式验证或实验测量。"
          : "Retain multiple site hypotheses. Native site probabilities are not drug-binding probabilities and do not replace docking, pose validation or experiments."}
      </p>
      <p>
        {zh ? "原生预测位点数" : "Native site count"}:{" "}
        {result.native_pocket_count}
      </p>
      {!result.pockets.length && (
        <p>
          {zh
            ? "此次没有返回候选口袋。请检查结构完整性、结构来源和方法适用性；没有口袋不代表该靶点无法被药物作用。"
            : "No candidate pockets were returned. Check structure completeness, input origin and method applicability; an empty result does not establish that the target is undruggable."}
        </p>
      )}
      <ul>
        {result.pockets.map((site) => (
          <li key={site.rank}>
            <button
              type="button"
              aria-pressed={site.rank === selected?.rank}
              onClick={() => {
                setSelected(site);
                setContinue(false);
              }}
            >
              {zh ? "口袋" : "Pocket"} {site.rank} ·{" "}
              {zh ? "模型概率" : "Model probability"}{" "}
              {site.probability.toFixed(3)} · {zh ? "原生分数" : "Native score"}{" "}
              {site.score.toFixed(2)} · {site.residues.length}{" "}
              {zh ? "个残基" : "residues"}
            </button>
          </li>
        ))}
      </ul>
      {result.truncated && (
        <p>
          {zh
            ? "面板只显示前列位点，其余内容保留在完整 CSV 中。"
            : "The panel shows the leading sites; others remain in the full CSV."}
        </p>
      )}
      <StructureViewer
        urls={[artifactUrl(job.id, result.protein_artifact)]}
        language={language}
      />
      {selected && (
        <>
          <p>
            {zh ? "所选残基" : "Selected residues"}:{" "}
            {selected.residues
              .map((r) => `${r.chain}:${r.number}${r.insertion_code}`)
              .join(", ")}
          </p>
          <button
            type="button"
            disabled={!usable}
            onClick={() => setContinue(true)}
          >
            {zh ? "用这个口袋生成分子" : "Generate molecules in this pocket"}
          </button>
          {!usable && (
            <p className="field-help">
              {zh
                ? "DiffSBDD 需要 PDB、单字符链标识和无歧义残基编号；请先完成明确转换与身份映射。"
                : "DiffSBDD requires PDB, single-character chains and unambiguous residue numbering. Convert explicitly while preserving identity mappings."}
            </p>
          )}
        </>
      )}
      {selected && continueDesign && (
        <DiffForm
          key={String(selected.rank)}
          mode="generate"
          language={language}
          initialProtein={result.protein}
          initialPocket={{ kind: "residues", residues: selected.residues }}
          onCreated={(j) =>
            setMessage(
              (zh ? "已创建生成任务：" : "Created generation task: ") + j.id,
            )
          }
        />
      )}
      {message && <p role="status">{message}</p>}
    </section>
  );
}
