import { CandidateReviewBar } from "../presentation/CandidateReviewBar";
import { StructureWorkbench } from "../presentation/StructureWorkbench";
import { useState } from "react";
import { ResearchTable } from "../presentation/ResearchTable";
import "./pocket-results.css";
import type { Job, Language } from "../types";
import type { PocketResult } from "./types";
import { StructureViewer } from "../viewer/StructureViewer";
import { artifactUrl } from "../api";
import { Hint } from "../guided/Hint";
import { PocketSelection } from "./PocketSelection";
import {
  ReferenceComparison,
  type ReferenceSession,
} from "./ReferenceComparison";
import {
  initialPocketBox,
  PocketResultsHandoff,
  type PocketContinuation,
  type PocketOrigin,
} from "./PocketResultsHandoff";
import { sameStructure } from "./reference-comparison";
interface PocketResultsProps {
  job: Pick<Job, "id">;
  result: PocketResult;
  language: Language;
  initialRank?: number;
}

export function PocketResults(props: PocketResultsProps) {
  return <PocketWorkspace key={props.job.id} {...props} />;
}

function PocketWorkspace({
  job,
  result,
  language,
  initialRank,
}: PocketResultsProps) {
  const zh = language === "zh";
  const [rank, setRank] = useState(initialRank);
  const selected =
    result.pockets.find((pocket) => pocket.rank === rank) ?? result.pockets[0];
  const [handoff, setHandoff] = useState<
    (PocketContinuation & { source: PocketResult }) | null
  >(null);
  const [message, setMessage] = useState("");
  const [overlay, setOverlay] = useState<string | null>(null);
  const [referenceSession, setReferenceSession] =
    useState<ReferenceSession | null>(null);
  function continueWith(
    action: PocketContinuation["action"],
    origin: PocketOrigin,
  ) {
    setHandoff({ action, origin, source: result });
  }
  if (handoff)
    return (
      <PocketResultsHandoff
        jobId={job.id}
        result={handoff.source}
        continuation={handoff}
        language={language}
        onBack={() => setHandoff(null)}
        onCreated={() =>
          setMessage(zh ? "后续任务已创建。" : "Follow-up task created.")
        }
      />
    );
  const coordinatesMatch =
    selected?.residues.every((residue) =>
      sameStructure(residue.structure, result.protein),
    ) ?? false;
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
      <StructureWorkbench
        toolbar={
          selected && (
            <CandidateReviewBar
              label={zh ? "口袋预览选择" : "Pocket preview selection"}
              caption={zh ? "口袋" : "Pocket"}
              candidates={result.pockets.map((site) => ({
                id: site.rank,
                label: (zh ? "预览口袋 " : "Preview pocket ") + site.rank,
                short: site.rank,
              }))}
              selected={selected.rank}
              language={language}
              onSelect={setRank}
              metrics={[
                {
                  label: zh ? "模型概率" : "Model probability",
                  value: selected.probability,
                },
                {
                  label: zh ? "位点评分" : "Site score",
                  value: selected.score,
                },
                {
                  label: zh ? "残基数" : "Residues",
                  value: selected.residues.length,
                },
              ]}
            />
          )
        }
        preview={
          <StructureViewer
            key={overlay ?? "protein-only"}
            focusModel={overlay ? 1 : undefined}
            initialMode={overlay ? "pocket" : undefined}
            urls={[
              artifactUrl(job.id, result.protein_artifact),
              ...(overlay ? [overlay] : []),
            ]}
            comparison={false}
            language={language}
            residueRegion={selected?.residues}
          />
        }
      >
        <div className="pocket-candidates">
          <ResearchTable
            title={zh ? "候选口袋" : "Candidate pockets"}
            rows={result.pockets}
            language={language}
            rowId={(site) => String(site.rank)}
            selected={selected ? String(selected.rank) : null}
            onSelect={(site) => setRank(site.rank)}
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
                    onClick={() => setRank(site.rank)}
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
            <ReferenceComparison
              key={job.id}
              protein={result.protein}
              site={selected}
              language={language}
              initialSession={referenceSession}
              onSession={setReferenceSession}
              onOverlay={setOverlay}
              onGenerate={(ligand, jobId) =>
                continueWith("generate", { kind: "reference", ligand, jobId })
              }
              onDock={(ligand, jobId) =>
                continueWith("dock", { kind: "reference", ligand, jobId })
              }
            />
          )}
          {selected && (
            <PocketSelection
              site={selected}
              proteinArtifact={result.protein_artifact}
              protein={result.protein}
              language={language}
              coordinatesMatch={coordinatesMatch}
              hasValidBox={Boolean(initialPocketBox(selected))}
              onGenerate={() =>
                continueWith("generate", { kind: "predicted", site: selected })
              }
              onDock={() =>
                continueWith("dock", { kind: "predicted", site: selected })
              }
            />
          )}
        </div>
      </StructureWorkbench>
      {message && <p role="status">{message}</p>}
    </section>
  );
}
