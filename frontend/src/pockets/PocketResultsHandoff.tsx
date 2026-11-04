import { useId, useState } from "react";
import { artifactUrl } from "../api";
import { DiffForm } from "../diffsbdd/DiffForm";
import { DockingForm } from "../docking/DockingForm";
import type { SearchBox } from "../docking/types";
import { ResearchHandoff } from "../guided/ResearchHandoff";
import { StructureWorkbench } from "../presentation/StructureWorkbench";
import { assetDownloadUrl } from "../research/asset-download";
import type { MoleculeRef } from "../research/types";
import type { Job, Language } from "../types";
import { StructureViewer } from "../viewer/StructureViewer";
import { searchBoxGeometry } from "../viewer/search-box";
import type { PocketResult, Site } from "./types";

export type PocketOrigin =
  | { kind: "predicted"; site: Site }
  | { kind: "reference"; ligand: MoleculeRef; jobId: string };

export interface PocketContinuation {
  action: "generate" | "dock";
  origin: PocketOrigin;
}

export function initialPocketBox(site: Site): SearchBox | null {
  try {
    return (
      searchBoxGeometry({
        center: [site.center_x, site.center_y, site.center_z],
        size: [20, 20, 20],
        unit: "angstrom",
      }) ?? null
    );
  } catch {
    return null;
  }
}

export function PocketResultsHandoff({
  jobId,
  result,
  continuation,
  language,
  onBack,
  onCreated,
}: {
  jobId: string;
  result: PocketResult;
  continuation: PocketContinuation;
  language: Language;
  onBack(): void;
  onCreated(job: Job): void;
}) {
  const zh = language === "zh";
  const { action, origin } = continuation;
  const [expanded, setExpanded] = useState(false);
  const previewId = useId();
  const predicted = origin.kind === "predicted" ? origin.site : null;
  const ligand = origin.kind === "reference" ? origin.ligand : null;
  const box =
    predicted && action === "dock" ? initialPocketBox(predicted) : null;
  const receptor = artifactUrl(jobId, result.protein_artifact);
  const title = predicted
    ? (zh ? "预测口袋 " : "Predicted pocket ") + predicted.rank
    : zh
      ? "参考配体定义的口袋"
      : "Reference ligand pocket";
  const destination =
    action === "dock"
      ? zh
        ? "探索结合模式"
        : "Explore binding poses"
      : zh
        ? "生成分子"
        : "Generate molecules";

  return (
    <ResearchHandoff language={language} onBack={onBack}>
      <section
        className="pocket-handoff-source"
        aria-label={zh ? "起始研究材料" : "Starting research inputs"}
      >
        <header>
          <h3>{title}</h3>
          <span>{destination}</span>
        </header>
        <div className="pocket-handoff-facts">
          {predicted && (
            <span>
              {predicted.residues.length} {zh ? "个残基" : "residues"}
            </span>
          )}
          {box && (
            <span>
              {zh ? "中心" : "Center"} ({box.center.join(", ")}) Å ·{" "}
              {zh ? "初始盒" : "Initial box"} {box.size.join(" × ")} Å
            </span>
          )}
          {origin.kind === "reference" && (
            <a href={`/#task=${encodeURIComponent(origin.jobId)}`}>
              {zh ? "参考区域来源" : "Source reference result"}
            </a>
          )}
          <a href={receptor} download>
            {zh ? "原始受体" : "Original receptor"}
          </a>
        </div>
        <button
          className="pocket-handoff-preview-toggle"
          type="button"
          aria-expanded={expanded}
          aria-controls={expanded ? previewId : undefined}
          onClick={() => setExpanded((value) => !value)}
        >
          <span aria-hidden="true">{expanded ? "▾" : "▸"}</span>
          {zh ? "预览起始结构" : "Preview starting structure"}
        </button>
      </section>
      <StructureWorkbench
        preview={
          expanded ? (
            <section
              id={previewId}
              aria-label={zh ? "起始结构" : "Starting structure"}
            >
              <StructureViewer
                urls={
                  ligand
                    ? [
                        receptor,
                        assetDownloadUrl(ligand.asset_id, ligand.record),
                      ]
                    : [receptor]
                }
                language={language}
                sourceSnapshot
                focusModel={ligand ? 1 : undefined}
                residueRegion={predicted?.residues}
                searchBox={box ?? undefined}
              />
            </section>
          ) : null
        }
      >
        {action === "dock" ? (
          <DockingForm
            language={language}
            initialReceptor={result.protein}
            initialReference={ligand}
            initialBox={box}
            onCreated={onCreated}
          />
        ) : (
          <DiffForm
            mode="generate"
            language={language}
            initialProtein={result.protein}
            initialPocket={
              origin.kind === "reference"
                ? { kind: "ligand", ligand: origin.ligand }
                : {
                    kind: "residues",
                    residues: origin.site.residues,
                  }
            }
            onCreated={onCreated}
          />
        )}
      </StructureWorkbench>
    </ResearchHandoff>
  );
}
