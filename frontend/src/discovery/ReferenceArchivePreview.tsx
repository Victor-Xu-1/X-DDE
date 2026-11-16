import { MoleculeImage } from "../presentation/MoleculeImage";
import { StructureViewer } from "../viewer/StructureViewer";
import type { Language } from "../types";
import type { ReferenceImportResult } from "./ReferenceImportResults";

/** Display the archived source without preparing new molecular coordinates. */
export function ReferenceArchivePreview({
  result,
  url,
  language,
  onVerified,
}: {
  result: ReferenceImportResult;
  url: string;
  language: Language;
  onVerified(ready: boolean): void;
}) {
  if (!/^[a-f0-9]{64}$/i.test(result.sha256))
    return (
      <p role="alert">
        {language === "zh"
          ? "暂时无法核验此文件，请重新导入参考材料。"
          : "This file cannot be verified. Import the reference again."}
      </p>
    );
  const sha256 = result.sha256.toLowerCase();
  return result.kind === "molecule" ? (
    <MoleculeImage
      source={{ url, record: 0, sha256 }}
      language={language}
      label={result.identifier}
      onDrawingReady={onVerified}
    />
  ) : (
    <StructureViewer
      urls={[url]}
      language={language}
      sourceSnapshot
      expectedStructureSha256={sha256}
      onStructureVerification={onVerified}
    />
  );
}
