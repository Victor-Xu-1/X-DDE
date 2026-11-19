import type { ReactNode } from "react";
import { artifactUrl } from "../api";
import type { Language } from "../types";
import { VerifiedArtifactDownload } from "./VerifiedArtifactDownload";
import "./spatial-results.css";

type Metric = { label: string; value: ReactNode; unit?: string };
type ResultFile = {
  artifact: string;
  label: string;
  downloadLabel: string;
  sha256?: string;
};

export function SpatialResultSummary({
  jobId,
  language,
  title,
  hint,
  metrics,
  files,
  children,
  className = "",
}: {
  jobId: string;
  language: Language;
  title: string;
  hint?: ReactNode;
  metrics: readonly Metric[];
  files: readonly ResultFile[];
  children?: ReactNode;
  className?: string;
}) {
  return (
    <section
      className={`spatial-result-summary ${className}`}
      aria-label={title}
    >
      <div className="spatial-summary-heading">
        <h3>{title}</h3>
        {hint}
      </div>
      {metrics.length > 0 && (
        <dl className="spatial-summary-metrics">
          {metrics.map(({ label, value, unit }) => (
            <div key={label}>
              <dt>{label}</dt>
              <dd>
                {value}
                {unit && <small> {unit}</small>}
              </dd>
            </div>
          ))}
        </dl>
      )}
      {children}
      <div
        className="spatial-summary-downloads"
        role="group"
        aria-label={language === "zh" ? "结果文件" : "Result files"}
      >
        {files.map(({ artifact, label, downloadLabel, sha256 }) =>
          sha256 ? (
            <VerifiedArtifactDownload
              key={artifact + ":" + sha256}
              url={artifactUrl(jobId, artifact)}
              sha256={sha256}
              filename={artifact}
              language={language}
              label={label}
              downloadLabel={downloadLabel}
              className="secondary-button"
            />
          ) : (
            <a
              key={artifact}
              className="secondary-button"
              href={artifactUrl(jobId, artifact)}
              aria-label={downloadLabel}
              download
            >
              {label}
            </a>
          ),
        )}
      </div>
    </section>
  );
}
