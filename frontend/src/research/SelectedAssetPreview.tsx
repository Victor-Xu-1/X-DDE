import { useRef } from "react";
import { MolecularPreview } from "../presentation/MolecularPreview";
import { useReveal } from "../presentation/useReveal";
import type { Language } from "../types";
import { StructureViewer } from "../viewer/StructureViewer";
import type { ObjectKind, ScientificObject } from "./types";
import { SequenceFilePreview } from "./SequenceFilePreview";

export function canPreviewFile(kind: ObjectKind) {
  return ["molecule", "structure", "pocket", "sequence"].includes(kind);
}

/** Display the selected scientific record; the original asset remains authoritative. */
export function SelectedAssetPreview({
  object,
  language,
}: {
  object: ScientificObject;
  language: Language;
}) {
  const panel = useRef<HTMLElement>(null);
  useReveal(panel, object.id);
  const url = `/api/assets/${encodeURIComponent(object.reference.asset_id)}`;
  const { record, sha256 } = object.reference;
  const molecule = object.kind === "molecule";
  if (!canPreviewFile(object.kind)) return null;
  return (
    <section
      ref={panel}
      className="research-selected-preview"
      aria-label={language === "zh" ? "所选文件预览" : "Selected file preview"}
    >
      {object.kind === "sequence" ? (
        <SequenceFilePreview
          key={JSON.stringify(object.reference)}
          reference={object.reference}
          language={language}
        />
      ) : molecule ? (
        <MolecularPreview
          key={JSON.stringify(object.reference)}
          language={language}
          label={object.label}
          source={{ url, record, sha256 }}
          urls={object.reference.conformer === 0 ? [url] : undefined}
          records={[record]}
          savedAssetSha256={sha256}
        />
      ) : (
        <StructureViewer
          key={JSON.stringify(object.reference)}
          urls={[url]}
          structureChecksums={[sha256]}
          language={language}
          comparison={false}
          showWorkspaceControls={false}
        />
      )}
      {molecule && (
        <p className="field-help">
          {language === "zh" ? `记录 ${record + 1}` : `Record ${record + 1}`}
        </p>
      )}
    </section>
  );
}
