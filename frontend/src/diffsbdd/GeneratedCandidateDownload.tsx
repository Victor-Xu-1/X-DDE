import { SdfArtifactDownload } from "../presentation/SdfArtifactDownload";
import type { Language } from "../types";
import "./generated-candidate-download.css";

/** The caller keys this control by the verified source and selected record. */
export function GeneratedCandidateDownload({
  url,
  sha256,
  record,
  number,
  language,
}: {
  url: string;
  sha256: string;
  record: number;
  number: number;
  language: Language;
}) {
  const zh = language === "zh";
  return (
    <SdfArtifactDownload
      className="generated-candidate-download"
      url={url}
      sha256={sha256}
      record={record}
      filename={`candidate-${number}.sdf`}
      language={language}
      label={zh ? "下载所选候选 SDF" : "Download selected candidate SDF"}
      errorLabel={
        zh
          ? "未能核对原始候选，请重试。"
          : "Could not verify the original candidate. Try again."
      }
    />
  );
}
