import type { Ref } from "react";
import { AimOutlined } from "@ant-design/icons";
import { artifactUrl } from "../api";
import { WorkspaceFullscreenControl } from "../presentation/WorkspaceFullscreenControl";
import type { Language } from "../types";
import type { SelectionInfo } from "../viewer/protocol";
import { StructureViewer } from "../viewer/StructureViewer";
import {
  StructurePairFigure,
  useStructurePairFigure,
} from "../viewer/StructurePairFigure";
import {
  AlignedStructurePair,
  alignedArtifacts,
  comparisonResidues,
  comparisonSides,
  type ComparisonSide,
} from "./AlignedStructurePair";
import { addressLabel, type Displacement } from "./types";
import { useComparisonView, type ComparisonView } from "./useComparisonView";

export function ComparisonPreview({
  jobId,
  language,
  headerRef,
  selection,
  hashes,
  onPick,
  onClear,
  onUse,
}: {
  jobId: string;
  language: Language;
  headerRef: Ref<HTMLDivElement>;
  selection: Displacement | null;
  hashes: Readonly<Record<string, string>>;
  onPick(side: ComparisonSide, atom: SelectionInfo | null): void;
  onClear(): void;
  onUse?: () => void;
}) {
  const zh = language === "zh";
  const matchViews = zh ? "匹配视角" : "Match views";
  const camera = useComparisonView();
  const figure = useStructurePairFigure();
  const { view } = camera;
  const modes: ComparisonView[] = ["overlay", "reference", "moving"];
  const hasChecksum = (side: ComparisonSide) =>
    /^[0-9a-f]{64}$/.test(hashes[alignedArtifacts[side]] ?? "");
  if (comparisonSides.every(hasChecksum)) modes.splice(1, 0, "pair");
  const sides =
    view === "overlay" || view === "pair" ? comparisonSides : [view];
  const modeLabels = {
    overlay: [zh ? "已对齐叠合" : "Aligned overlay", zh ? "叠合" : "Overlay"],
    pair: [
      zh ? "已对齐并列" : "Aligned side by side",
      zh ? "并列" : "Side by side",
    ],
    reference: [zh ? "参照" : "Reference", zh ? "参照" : "Reference"],
    moving: [
      zh ? "已对齐比较结构" : "Aligned comparison",
      zh ? "比较" : "Aligned",
    ],
  };
  return (
    <>
      <div className="comparison-preview-header" ref={headerRef} tabIndex={-1}>
        <div className="comparison-preview-actions">
          {modes.map((value) => {
            const [label, short] = modeLabels[value];
            return (
              <button
                key={value}
                type="button"
                className="secondary-button comparison-view-mode"
                aria-label={label}
                title={label}
                aria-pressed={view === value}
                disabled={camera.busy}
                onClick={() => camera.change(value)}
              >
                {label === short ? (
                  label
                ) : (
                  <>
                    <span className="comparison-label-full">{label}</span>
                    <span className="comparison-label-short" aria-hidden="true">
                      {short}
                    </span>
                  </>
                )}
              </button>
            );
          })}
          <div className="comparison-view-actions">
            {view === "pair" && (
              <>
                <button
                  type="button"
                  className="secondary-button comparison-match-views"
                  aria-label={matchViews}
                  title={matchViews}
                  disabled={!camera.pairReady || camera.busy}
                  onClick={camera.matchViews}
                >
                  <AimOutlined className="comparison-match-icon" aria-hidden="true" />
                  <span className="comparison-match-label">{matchViews}</span>
                </button>
                <StructurePairFigure
                  figure={figure}
                  labels={
                    zh
                      ? ["参照结构", "已对齐比较结构"]
                      : ["Reference structure", "Aligned comparison"]
                  }
                  filename={`X-DDE-alignment-${jobId.slice(0, 8)}`}
                  language={language}
                  disabled={camera.busy}
                  compactTrigger
                />
              </>
            )}
            <WorkspaceFullscreenControl
              language={language}
              compact
              structureFocus
            />
          </div>
        </div>
        <div className="comparison-preview-context">
          <p className="field-help">
            {view === "overlay"
              ? zh
                ? "蓝色参照 · 橙色比较 · 同一对齐坐标系"
                : "Blue reference · Orange comparison · Shared alignment frame"
              : view === "pair"
                ? zh
                  ? "同一已对齐坐标系 · 点选查看对应残基"
                  : "Shared alignment frame · Pick to inspect corresponding residues"
                : zh
                  ? "原生链配色"
                  : "Native chain colors"}
          </p>
          {selection && (
            <output className="field-help">
              {addressLabel(selection.reference)} →{" "}
              {addressLabel(selection.moving)} ·{" "}
              {selection.displacement_angstrom.toFixed(3)} Å
              <button type="button" className="text-button" onClick={onClear}>
                {zh ? "清除选择" : "Clear selection"}
              </button>
            </output>
          )}
        </div>
        {camera.cameraFailed && (
          <p className="field-help" role="status">
            {zh
              ? "暂时无法读取视角，可重试。"
              : "Could not read the current view. Try again."}
          </p>
        )}
      </div>
      {view === "pair" ? (
        <AlignedStructurePair
          jobId={jobId}
          language={language}
          hashes={hashes}
          selection={selection}
          onPick={onPick}
          publish={camera.publish}
          publishFigure={figure.publish}
        />
      ) : (
        <StructureViewer
          key={jobId + ":" + view}
          urls={sides.map((side) => artifactUrl(jobId, alignedArtifacts[side]))}
          language={language}
          comparison={view === "overlay"}
          structureChecksums={
            sides.every(hasChecksum)
              ? sides.map((side) => hashes[alignedArtifacts[side]])
              : undefined
          }
          cifAuthorResidues
          showWorkspaceControls={false}
          sourceSnapshot
          residueRegion={comparisonResidues(selection, sides)}
          onCameraReady={camera.publish[view]}
        />
      )}
      {onUse && (
        <button type="button" className="secondary-button" onClick={onUse}>
          {zh
            ? "用已对齐结构寻找口袋"
            : "Find pockets on the aligned structure"}
        </button>
      )}
    </>
  );
}
