import type { ReactNode } from "react";
import type { Language } from "../types";
import { StructureWorkbench } from "../presentation/StructureWorkbench";
import { StructureViewer } from "../viewer/StructureViewer";
import "./prepared-structure.css";

export function PreparedStructureWorkspace({
  language,
  artifact,
  checksum,
  metrics,
  actions,
  children,
}: {
  language: Language;
  artifact?: string;
  checksum?: string;
  metrics: readonly { label: string; value: string | number }[];
  actions?: ReactNode;
  children?: ReactNode;
}) {
  const zh = language === "zh";
  const title = zh ? "处理后的结构" : "Prepared structure";
  return (
    <section
      className="prepared-structure-workspace"
      aria-label={zh ? "结构准备结果" : "Structure preparation result"}
    >
      <StructureWorkbench
        preview={
          artifact ? (
            <StructureViewer
              urls={[artifact]}
              sourceSnapshot
              expectedStructureSha256={checksum}
              language={language}
            />
          ) : null
        }
      >
        <section className="prepared-structure-summary" aria-label={title}>
          <h3>{title}</h3>
          {metrics.length > 0 && (
            <dl>
              {metrics.map(({ label, value }) => (
                <div key={label}>
                  <dt>{label}</dt>
                  <dd>{value}</dd>
                </div>
              ))}
            </dl>
          )}
          {artifact ? (
            <div className="prepared-structure-actions">
              <a className="secondary-button" href={artifact} download>
                {zh ? "下载结构" : "Download structure"}
              </a>
              {actions}
            </div>
          ) : (
            <p role="status">
              {zh
                ? "此结果没有保存结构文件。"
                : "No structure file was saved with this result."}
            </p>
          )}
          {children}
        </section>
      </StructureWorkbench>
    </section>
  );
}
