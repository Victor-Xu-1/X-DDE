import { useState } from "react";
import { artifactUrl } from "../api";
import { ResearchHandoff } from "../guided/ResearchHandoff";
import { PocketForm } from "../pockets/PocketForm";
import type { Job, Language } from "../types";
import type { StructurePrepareResult } from "./preparation-types";
import { PreparedStructureWorkspace } from "./PreparedStructureWorkspace";

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
  const metrics = [
    { label: zh ? "原子数" : "Atoms", value: result.atom_count },
    {
      label: zh ? "格式" : "Format",
      value: result.options.format === "pdb" ? "PDB" : "mmCIF",
    },
  ];
  if (result.inspection.selected_chains.length > 0)
    metrics.push({
      label: zh ? "选用的原始链" : "Selected source chains",
      value: result.inspection.selected_chains.join(", "),
    });
  return (
    <PreparedStructureWorkspace
      language={language}
      artifact={artifact}
      checksum={result.sha256}
      metrics={metrics}
      actions={
        nextInput &&
        onCreated && (
          <button
            className="primary-button"
            type="button"
            onClick={() => setPocket(true)}
          >
            {zh ? "用此结构寻找口袋" : "Find pockets with this structure"}
          </button>
        )
      }
    >
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
    </PreparedStructureWorkspace>
  );
}
