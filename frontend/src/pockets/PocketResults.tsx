import { useState } from "react";
import { ResearchTable } from "../presentation/ResearchTable";
import "./pocket-results.css";
import type { Job, Language } from "../types";
import type { PocketResult, Site } from "./types";
import { StructureViewer } from "../viewer/StructureViewer";
import { DiffForm } from "../diffsbdd/DiffForm";
import { DockingForm } from "../docking/DockingForm";
import { artifactUrl } from "../api";
import { ResearchHandoff } from "../guided/ResearchHandoff";
import { Hint } from "../guided/Hint";
import { PocketSelection } from "./PocketSelection";
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
      <header className="pocket-result-heading">
        <h2>{zh ? "候选口袋" : "Candidate pockets"}</h2>
        <span>
          {result.native_pocket_count} {zh ? "个候选" : "candidates"}
        </span>
        <Hint label={zh ? "口袋评分说明" : "Pocket scoring help"}>
          {zh
            ? "位点概率用于比较候选口袋，不是药物结合概率。"
            : "Site probabilities compare candidate pockets; they are not drug-binding probabilities."}
        </Hint>
      </header>
      {!result.pockets.length && (
        <p role="status">
          {zh
            ? "此次没有返回候选口袋。请检查结构完整性、结构来源和方法适用性；没有口袋不代表该靶点无法被药物作用。"
            : "No candidate pockets were returned. Check structure completeness, input origin and method applicability; an empty result does not establish that the target is undruggable."}
        </p>
      )}
      <div className="pocket-explorer">
        <div className="pocket-candidates">
          <ResearchTable
            title={zh ? "候选口袋" : "Candidate pockets"}
            rows={result.pockets}
            language={language}
            rowId={(site) => String(site.rank)}
            selected={selected ? String(selected.rank) : null}
            compare={false}
            columns={[
              {
                key: "rank",
                label: zh ? "口袋" : "Pocket",
                value: (site) => site.rank,
                render: (site) => (
                  <button
                    type="button"
                    className="record-select"
                    aria-pressed={site.rank === selected?.rank}
                    onClick={() => {
                      setSelected(site);
                      setContinue(false);
                      setDocking(false);
                    }}
                  >
                    {zh ? "口袋" : "Pocket"} {site.rank}
                  </button>
                ),
              },
              {
                key: "probability",
                label: zh ? "模型概率" : "Model probability",
                value: (site) => site.probability,
                numeric: true,
              },
              {
                key: "score",
                label: zh ? "位点评分" : "Site score",
                value: (site) => site.score,
                numeric: true,
              },
              {
                key: "residues",
                label: zh ? "残基数" : "Residues",
                value: (site) => site.residues.length,
                numeric: true,
              },
            ]}
          />
          {result.truncated && (
            <p>
              {zh
                ? "面板只显示前列位点，其余内容保留在完整 CSV 中。"
                : "The panel shows the leading sites; others remain in the full CSV."}
            </p>
          )}
          {selected && (
            <PocketSelection
              site={selected}
              proteinArtifact={result.protein_artifact}
              language={language}
              onGenerate={() => setContinue(true)}
              onDock={() => {
                setDocking(true);
                setContinue(false);
              }}
            />
          )}
        </div>
        <StructureViewer
          urls={[artifactUrl(job.id, result.protein_artifact)]}
          language={language}
          residueRegion={selected?.residues}
        />
      </div>
      {message && <p role="status">{message}</p>}
    </section>
  );
}
