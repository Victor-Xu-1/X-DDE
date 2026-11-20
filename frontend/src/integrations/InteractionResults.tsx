import { StructureWorkbench } from "../presentation/StructureWorkbench";
import { useId, useRef, useState } from "react";
import { artifactUrl } from "../api";
import { ResearchTable } from "../presentation/ResearchTable";
import { StructureViewer } from "../viewer/StructureViewer";
import type { Job, Language } from "../types";
import type { NativeInteraction, NativeResult } from "./types";
import type { SceneInfo } from "../viewer/protocol";
import {
  interactionResidueKey,
  interactionResidueLabel,
} from "./interaction-residue";
import "../presentation/spatial-result-review.css";
import "./interaction-workspace.css";

export const interactionNames: Record<string, [string, string]> = {
  hydrogen_bond: ["氢键", "Hydrogen bond"],
  hydrophobic: ["疏水作用", "Hydrophobic contact"],
  salt_bridge: ["盐桥", "Salt bridge"],
  pi_stack: ["π 堆积", "π stacking"],
  pi_cation: ["阳离子–π", "Cation–π"],
  halogen_bond: ["卤键", "Halogen bond"],
  water_bridge: ["水桥", "Water bridge"],
  metal_complex: ["金属配位", "Metal coordination"],
};
type InteractionRow = NativeInteraction & { id: string };

function revealRegion(region: HTMLElement | null, anchor = region) {
  region?.focus({ preventScroll: true });
  anchor?.scrollIntoView?.({ block: "start", behavior: "instant" });
}

export function InteractionResults({
  job,
  result,
  language,
}: {
  job: Job;
  result: NativeResult;
  language: Language;
}) {
  const source = result.structure_artifact;
  const sourceKey = JSON.stringify([
    job.id,
    source,
    source ? result.artifact_sha256[source] : null,
  ]);
  return (
    <InteractionWorkspace
      key={sourceKey}
      job={job}
      result={result}
      language={language}
    />
  );
}

function InteractionWorkspace({
  job,
  result,
  language,
}: {
  job: Job;
  result: NativeResult;
  language: Language;
}) {
  const [scene, setScene] = useState<SceneInfo | null>(null);
  const [sequenceHost, setSequenceHost] = useState<HTMLDivElement | null>(null);
  const [toolsOpen, setToolsOpen] = useState(false);
  const previewId = useId();
  const contactsId = useId();
  const preview = useRef<HTMLElement>(null);
  const contacts = useRef<HTMLElement>(null);
  const header = useRef<HTMLElement>(null);
  const [focus, setFocus] = useState<{
    id: string;
    residue: string;
    nonce: number;
  } | null>(null);
  const zh = language === "zh",
    rows = result.interactions.map((row, index) => ({
      ...row,
      id: String(index),
    }));
  function returnToPreview() {
    const region = preview.current;
    const expanded = region?.closest('[data-workspace-expanded="true"]');
    revealRegion(region, expanded ? region : header.current);
  }
  return (
    <section
      className={
        "interaction-results plip-result-workspace contact-workspace" +
        (result.structure_artifact ? " spatial-review" : "")
      }
      aria-label={zh ? "配体相互作用结果" : "Ligand interaction results"}
    >
      <header className="interaction-result-method" ref={header}>
        <span className="interaction-method-label">
          {zh ? "分析方法" : "Analysis method"}
        </span>
        <strong>PLIP</strong> <span>{result.version}</span>
        {result.structure_artifact && (
          <div className="interaction-narrow-actions">
            <button
              className="secondary-button"
              type="button"
              aria-expanded={toolsOpen}
              aria-controls={previewId}
              aria-label={
                zh ? "视图工具与导出" : "View tools for display and export"
              }
              onClick={() => setToolsOpen((previous) => !previous)}
            >
              {zh ? "视图工具" : "View tools"}
            </button>
            <button
              className="secondary-button"
              type="button"
              aria-controls={contactsId}
              aria-label={zh ? "查看相互作用" : "Review interactions"}
              onClick={() => revealRegion(contacts.current)}
            >
              {zh ? "相互作用 ↓" : "Interactions ↓"}
            </button>
          </div>
        )}
      </header>
      <StructureWorkbench
        sequenceHostRef={setSequenceHost}
        preview={
          result.structure_artifact && (
            <section
              id={previewId}
              className="interaction-preview-region"
              data-view-tools={toolsOpen ? "open" : "closed"}
              tabIndex={-1}
              aria-label={
                zh ? "配体与蛋白三维视图" : "Ligand and protein 3D view"
              }
              ref={preview}
            >
              <StructureViewer
                sourceSnapshot
                urls={[artifactUrl(job.id, result.structure_artifact)]}
                expectedStructureSha256={
                  result.artifact_sha256[result.structure_artifact]
                }
                language={language}
                nativeInteractions={result.interactions}
                focusResidue={focus}
                onSceneLoaded={setScene}
                sequenceHost={sequenceHost}
                onStructureVerification={(verified) => {
                  if (!verified) {
                    setScene(null);
                    setFocus(null);
                  }
                }}
              />
            </section>
          )
        }
      >
        <section
          id={contactsId}
          className="interaction-review-region"
          aria-label={zh ? "相互作用判读" : "Interaction review"}
          tabIndex={-1}
          ref={contacts}
        >
          {result.structure_artifact && (
            <button
              className="secondary-button interaction-return-to-view"
              type="button"
              aria-controls={previewId}
              onClick={returnToPreview}
            >
              {zh ? "返回三维 ↑" : "Back to 3D ↑"}
            </button>
          )}
          <ResearchTable<InteractionRow>
            compactToolbar
            language={language}
            title={zh ? "关键相互作用" : "Key interactions"}
            rows={rows}
            rowId={(row) => row.id}
            selected={focus?.id ?? null}
            canSelect={(row) =>
              !!scene && interactionResidueKey(row, scene.residues) !== null
            }
            onSelect={(row) => {
              const residue =
                scene && interactionResidueKey(row, scene.residues);
              if (residue)
                setFocus((previous) => ({
                  id: row.id,
                  residue,
                  nonce: (previous?.nonce ?? 0) + 1,
                }));
            }}
            columns={[
              {
                key: "residue",
                label: zh ? "残基" : "Residue",
                value: interactionResidueLabel,
                render: (row) => (
                  <span className="interaction-residue">
                    {interactionResidueLabel(row)}
                  </span>
                ),
              },
              {
                key: "type",
                label: zh ? "作用类型" : "Interaction",
                value: (row) =>
                  interactionNames[row.kind]?.[zh ? 0 : 1] ?? row.kind,
              },
              {
                key: "distance",
                label: zh ? "端点距离（Å）" : "Endpoint distance (Å)",
                numeric: true,
                value: (row) => row.distance,
                render: (row) => row.distance.toFixed(2),
              },
            ]}
          />
          <a
            className="secondary-button"
            href={artifactUrl(job.id, "interactions.csv")}
            download
          >
            {zh ? "下载相互作用表" : "Download interaction table"}
          </a>
        </section>
      </StructureWorkbench>
    </section>
  );
}
