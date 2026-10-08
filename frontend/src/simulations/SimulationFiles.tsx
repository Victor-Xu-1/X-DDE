import { artifactUrl } from "../api";
import type { Job, Language } from "../types";
export function SimulationFiles({
  job,
  files,
  language,
}: {
  job: Job;
  files: Record<string, string>;
  language: Language;
}) {
  const zh = language === "zh";
  return (
    <details className="simulation-method">
      <summary>{zh ? "下载研究数据" : "Download research data"}</summary>
      <div className="download-actions">
        {Object.keys(files)
          .filter(
            (name) =>
              !/-frame-/.test(name) &&
              /\.(dcd|chk|pdb|xml|sdf|csv|graphml|zip|json)$/.test(name),
          )
          .map((name) => (
            <a
              className="secondary-button"
              key={name}
              href={artifactUrl(job.id, name)}
              download
            >
              {name} ↓
            </a>
          ))}
      </div>
    </details>
  );
}
