import { artifactUrl } from "../api";
import { VerifiedArtifactDownload } from "../presentation/VerifiedArtifactDownload";
import type { Language } from "../types";
import type { SelectionInfo } from "../viewer/protocol";
import type { StructureCameraHandle } from "../viewer/structure-camera";
import { StructureViewer } from "../viewer/StructureViewer";
import type { StructureFigureHandle } from "../viewer/useStructureFigure";
import type { Displacement } from "./types";

export const alignedArtifacts = {
  reference: "reference-selected.cif",
  moving: "moving-aligned.cif",
} as const;
export type ComparisonSide = keyof typeof alignedArtifacts;
export const comparisonSides = ["reference", "moving"] as const;

export function comparisonResidues(
  selection: Displacement | null,
  sides: readonly ComparisonSide[],
) {
  return selection
    ? sides.map((side, model) => ({
        ...selection[side],
        model,
        alternate_location: "",
      }))
    : [];
}

export function matchedResidue(
  rows: readonly Displacement[],
  side: ComparisonSide,
  picked: SelectionInfo | null,
) {
  const identity = picked?.identity;
  if (!identity || identity.is_ligand) return undefined;
  return rows.find((row) => {
    const residue = row[side];
    return (
      residue.chain === identity.chain &&
      residue.number === identity.number &&
      residue.insertion_code === identity.insertion_code
    );
  });
}

export function AlignedStructurePair({
  jobId,
  language,
  hashes,
  selection,
  onPick,
  publish,
  publishFigure,
}: {
  jobId: string;
  language: Language;
  hashes: Readonly<Record<string, string>>;
  selection: Displacement | null;
  onPick(side: ComparisonSide, atom: SelectionInfo | null): void;
  publish: Record<
    `pair-${ComparisonSide}`,
    (handle: StructureCameraHandle | null) => void
  >;
  publishFigure: readonly [
    (handle: StructureFigureHandle | null) => void,
    (handle: StructureFigureHandle | null) => void,
  ];
}) {
  const zh = language === "zh";
  return (
    <div className="aligned-structure-pair" data-structure-focus-group>
      {comparisonSides.map((side, index) => {
        const label =
          index === 0
            ? zh
              ? "参照结构"
              : "Reference structure"
            : zh
              ? "已对齐比较结构"
              : "Aligned comparison";
        const name = alignedArtifacts[side];
        const url = artifactUrl(jobId, name);
        const badge = index === 0 ? "A" : "B";
        const short =
          index === 0 ? (zh ? "参照" : "Reference") : zh ? "比较" : "Aligned";
        return (
          <section key={side} aria-label={`${badge} · ${label}`}>
            <StructureViewer
              urls={[url]}
              heading={
                <div className="aligned-structure-heading">
                  <h3 aria-label={`${badge} · ${label}`}>
                    <span className="aligned-structure-badge">{badge}</span>{" "}
                    <span className="comparison-label-full">{label}</span>
                    <span className="comparison-label-short" aria-hidden="true">
                      {short}
                    </span>
                  </h3>
                  <VerifiedArtifactDownload
                    url={url}
                    sha256={hashes[name]}
                    filename={name}
                    language={language}
                    label="CIF ↓"
                    downloadLabel={
                      zh ? `下载${label} CIF` : `Download ${label} CIF`
                    }
                    className="text-button"
                  />
                </div>
              }
              structureChecksums={[hashes[name]]}
              cifAuthorResidues
              sourceSnapshot
              ligandContext={false}
              sequenceHost={null}
              language={language}
              residueRegion={comparisonResidues(selection, [side])}
              onAtomSelected={(atom) => onPick(side, atom)}
              onCameraReady={publish[`pair-${side}`]}
              onFigureReady={publishFigure[index]}
              showWorkspaceControls={false}
              figureFilename={`X-DDE-aligned-${side}`}
            />
          </section>
        );
      })}
    </div>
  );
}
