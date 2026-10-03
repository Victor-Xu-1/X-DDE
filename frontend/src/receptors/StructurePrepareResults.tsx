import { useState } from "react";
import { artifactUrl } from "../api";
import { StructureViewer } from "../viewer/StructureViewer";
import { PocketForm } from "../pockets/PocketForm";
import type { Job, Language } from "../types";
import type { StructurePrepareResult } from "./preparation-types";

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
    [pocket, setPocket] = useState(false);
  if (pocket && result.reference && onCreated)
    return (
      <section>
        <button type="button" onClick={() => setPocket(false)}>
          {zh ? "返回结构" : "Back to structure"}
        </button>
        <PocketForm
          language={language}
          onCreated={onCreated}
          initialProtein={result.reference}
          onPredict={() => setPocket(false)}
        />
      </section>
    );
  return (
    <div className="discovery-results">
      <p>
        {zh ? "新结构已保存" : "New structure saved"} · {result.atom_count}{" "}
        {zh ? "原子" : "atoms"}
      </p>
      <StructureViewer
        urls={[artifactUrl(job.id, result.artifact)]}
        language={language}
      />
      {result.reference && onCreated && result.options.format === "pdb" && (
        <button type="button" onClick={() => setPocket(true)}>
          {zh ? "用这个版本寻找口袋" : "Find pockets with this version"}
        </button>
      )}
      <a href={artifactUrl(job.id, result.artifact)} download>
        {zh ? "下载结构" : "Download structure"}
      </a>
      <details>
        <summary>{zh ? "处理记录" : "Preparation record"}</summary>
        <p>
          {zh ? "删除的残基/分子" : "Removed residues/components"}:{" "}
          {result.removed_residues.length} ·{" "}
          {zh ? "明确选择的替代位置" : "Explicit alternate choices"}:{" "}
          {result.resolved_alternates.length}
        </p>
        {result.inspection.parser_warnings.map((message, i) => (
          <p key={i} role="status">
            {message}
          </p>
        ))}
      </details>
    </div>
  );
}
