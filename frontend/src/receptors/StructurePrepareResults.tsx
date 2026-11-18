import { StructureWorkbench } from "../presentation/StructureWorkbench";
import { useState } from "react";
import { artifactUrl } from "../api";
import { StructureViewer } from "../viewer/StructureViewer";
import { ResearchHandoff } from "../guided/ResearchHandoff";
import { PocketForm } from "../pockets/PocketForm";
import type { Job, Language } from "../types";
import type { StructurePrepareResult } from "./preparation-types";
import "./prepared-structure.css";

export function StructurePrepareResults({
  job,
  result,
  language,
  onCreated,
}: {
  job: Job;
  result: StructurePrepareResult;
  language: Language;
  onCreated?(job: Job): void;
}) {
  const zh = language === "zh",
    [pocket, setPocket] = useState(false),
    artifact = artifactUrl(job.id, result.artifact),
    nextInput = result.options.format === "pdb" ? result.reference : undefined;
  if (pocket && nextInput && onCreated)
    return (
      <ResearchHandoff
        language={language}
        onBack={() => setPocket(false)}
        capability="p2rank.detect"
      >
        <PocketForm
          language={language}
          onCreated={onCreated}
          initialProtein={nextInput}
          onPredict={() => setPocket(false)}
        />
      </ResearchHandoff>
    );
  return (
    <section
      className="prepared-structure-workspace"
      aria-label={zh ? "结构准备结果" : "Structure preparation result"}
    >
      <StructureWorkbench
        preview={
          <StructureViewer
            urls={[artifact]}
            sourceSnapshot
            expectedStructureSha256={result.sha256}
            language={language}
          />
        }
      >
        <section
          className="prepared-structure-summary"
          aria-label={zh ? "处理后的结构" : "Prepared structure"}
        >
          <h3>{zh ? "处理后的结构" : "Prepared structure"}</h3>
          <dl>
            <div>
              <dt>{zh ? "原子数" : "Atoms"}</dt>
              <dd>{result.atom_count}</dd>
            </div>
            <div>
              <dt>{zh ? "格式" : "Format"}</dt>
              <dd>{result.options.format === "pdb" ? "PDB" : "mmCIF"}</dd>
            </div>
            {result.inspection.selected_chains.length > 0 && (
              <div>
                <dt>{zh ? "链" : "Chains"}</dt>
                <dd>{result.inspection.selected_chains.join(", ")}</dd>
              </div>
            )}
          </dl>
          <div className="prepared-structure-actions">
            <a className="secondary-button" href={artifact} download>
              {zh ? "下载结构" : "Download structure"}
            </a>
            {nextInput && onCreated && (
              <button
                className="primary-button"
                type="button"
                onClick={() => setPocket(true)}
              >
                {zh ? "用此结构寻找口袋" : "Find pockets with this structure"}
              </button>
            )}
          </div>
          <details>
            <summary>{zh ? "处理记录" : "Preparation record"}</summary>
            <p>
              {zh ? "删除的残基/分子" : "Removed residues/components"}:{" "}
              {result.removed_residues.length} ·{" "}
              {zh ? "明确选择的替代位置" : "Explicit alternate choices"}:{" "}
              {result.resolved_alternates.length}
            </p>
            {result.inspection.parser_warnings.map((message, i) => (
              <p key={i}>{message}</p>
            ))}
          </details>
        </section>
      </StructureWorkbench>
    </section>
  );
}
