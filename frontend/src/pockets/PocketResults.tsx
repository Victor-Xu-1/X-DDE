import { useState } from "react";
import "./pocket-results.css";
import type { Job, Language } from "../types";
import type { PocketResult, Site } from "./types";
import { StructureViewer } from "../viewer/StructureViewer";
import { DiffForm } from "../diffsbdd/DiffForm";
import { DockingForm } from "../docking/DockingForm";
import { artifactUrl } from "../api";
import { ResearchHandoff } from "../guided/ResearchHandoff";
export function PocketResults({
  job,
  result,
  language,
  initialRank,
}: {
  job: Pick<Job, "id">;
  result: PocketResult;
  language: Language;
  initialRank?: number;
}) {
  const zh = language === "zh",
    [selected, setSelected] = useState<Site | null>(
      () =>
        result.pockets.find((p) => p.rank === initialRank) ??
        result.pockets[0] ??
        null,
    ),
    [continueDesign, setContinue] = useState(false),
    [continueDocking, setDocking] = useState(false),
    [message, setMessage] = useState("");
  const usable =
    result.protein_artifact.endsWith(".pdb") &&
    !!selected?.residues.length &&
    selected.residues.every(
      (r) => r.chain.length === 1 && !r.insertion_code && !r.alternate_location,
    );
  if (selected && (continueDesign || continueDocking))
    return (
      <ResearchHandoff
        language={language}
        onBack={() => {
          setContinue(false);
          setDocking(false);
        }}
      >
        {continueDesign ? (
          <DiffForm
            key={selected.rank}
            mode="generate"
            language={language}
            initialProtein={result.protein}
            initialPocket={{ kind: "residues", residues: selected.residues }}
            onCreated={() =>
              setMessage(
                zh
                  ? "生成任务已创建，可在任务记录中查看。"
                  : "Generation task created; view it in Task history.",
              )
            }
          />
        ) : (
          <>
            <p className="field-help">
              {zh
                ? "以所选口袋为中心；20 Å 为可调整的初始搜索范围。"
                : "The selected pocket defines the center; 20 Å is an editable initial search size."}
            </p>
            <DockingForm
              key={selected.rank}
              language={language}
              initialReceptor={result.protein}
              initialBox={{
                center: [
                  selected.center_x,
                  selected.center_y,
                  selected.center_z,
                ],
                size: [20, 20, 20],
                unit: "angstrom",
              }}
              onCreated={() =>
                setMessage(
                  zh
                    ? "结合模式任务已创建，可在任务记录中查看。"
                    : "Binding pose task created; view it in Task history.",
                )
              }
            />
          </>
        )}
      </ResearchHandoff>
    );
  return (
    <section className="operation-results">
      <p className="field-help">
        {zh
          ? "位点概率用于比较候选口袋，不是药物结合概率。"
          : "Site probabilities compare candidate pockets; they are not drug-binding probabilities."}
      </p>
      <p>
        {zh ? "候选口袋" : "Candidate pockets"}: {result.native_pocket_count}
      </p>
      {!result.pockets.length && (
        <p>
          {zh
            ? "此次没有返回候选口袋。请检查结构完整性、结构来源和方法适用性；没有口袋不代表该靶点无法被药物作用。"
            : "No candidate pockets were returned. Check structure completeness, input origin and method applicability; an empty result does not establish that the target is undruggable."}
        </p>
      )}
      <ul className="pocket-result-list">
        {result.pockets.map((site) => (
          <li key={site.rank}>
            <button
              type="button"
              aria-pressed={site.rank === selected?.rank}
              onClick={() => {
                setSelected(site);
                setContinue(false);
                setDocking(false);
              }}
            >
              <strong>
                {zh ? "口袋" : "Pocket"} {site.rank}
              </strong>
              <span>
                {zh ? "模型概率" : "Model probability"}{" "}
                {site.probability.toFixed(3)} · {zh ? "位点评分" : "Site score"}{" "}
                {site.score.toFixed(2)}
              </span>
              <small>
                {site.residues.length} {zh ? "个残基" : "residues"}
              </small>
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
        residueRegion={selected?.residues}
      />
      {selected && (
        <>
          <details>
            <summary>
              {zh ? "所选口袋残基" : "Selected pocket residues"}
            </summary>
            <p>
              {zh ? "所选残基" : "Selected residues"}:{" "}
              {selected.residues
                .map((r) => `${r.chain}:${r.number}${r.insertion_code}`)
                .join(", ")}
            </p>
          </details>
          <button
            className="secondary-button"
            type="button"
            disabled={!usable}
            onClick={() => setContinue(true)}
          >
            {zh ? "用这个口袋生成分子" : "Generate molecules in this pocket"}
          </button>
          <button
            className="secondary-button"
            type="button"
            disabled={!result.protein_artifact.endsWith(".pdb")}
            onClick={() => {
              setDocking(true);
              setContinue(false);
            }}
          >
            {zh ? "探索这个口袋的结合模式" : "Explore poses in this pocket"}
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
      {message && <p role="status">{message}</p>}
    </section>
  );
}
