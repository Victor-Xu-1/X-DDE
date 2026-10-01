import { useState } from "react";
import { artifactUrl } from "../api";
import { StructureViewer } from "../viewer/StructureViewer";
import { PocketForm } from "../pockets/PocketForm";
import { StateForm } from "../chemistry/StateForm";
import { Hint } from "../guided/Hint";
import type { MoleculeRef } from "../research/types";
import type { Job, Language } from "../types";
export interface ReferenceImportResult {
  operation: "reference_import";
  source: "pdb" | "chembl";
  identifier: string;
  artifact: string;
  sha256: string;
  kind: "structure" | "molecule";
  reference?: MoleculeRef;
  request: { format: "pdb" | "cif" | "sdf" };
}
export function ReferenceImportResults({
  job,
  result,
  language,
  onCreated,
}: {
  job: Job;
  result: ReferenceImportResult;
  language: Language;
  onCreated?(job: Job): void;
}) {
  const zh = language === "zh",
    [next, setNext] = useState<"pocket" | "states" | null>(null);
  if (next && result.reference && onCreated)
    return (
      <section>
        <button type="button" onClick={() => setNext(null)}>
          {zh ? "返回参考材料" : "Back to reference material"}
        </button>
        {next === "states" ? (
          <StateForm
            language={language}
            onCreated={onCreated}
            initialMolecule={result.reference}
          />
        ) : (
          <PocketForm
            language={language}
            onCreated={onCreated}
            onPredict={() => setNext(null)}
            initialProtein={result.reference}
          />
        )}
      </section>
    );
  return (
    <div className="discovery-results">
      <h3>{result.identifier}</h3>
      <p className="field-help">
        {zh
          ? "原始参考材料已保存，保留来源和字节摘要；尚未完成后续结构或分子准备。"
          : "Original reference saved with provenance/digest; subsequent structure or molecule preparation is separate."}
      </p>
      <StructureViewer
        urls={[artifactUrl(job.id, result.artifact)]}
        language={language}
      />
      <div>
        <a href={artifactUrl(job.id, result.artifact)} download>
          {zh ? "下载原始材料" : "Download original material"}
        </a>
        {result.reference && onCreated && result.kind === "molecule" && (
          <button type="button" onClick={() => setNext("states")}>
            {zh ? "准备分子与构象" : "Prepare molecular states/conformers"}
          </button>
        )}
        {result.reference &&
          onCreated &&
          result.kind === "structure" &&
          result.request.format === "pdb" && (
            <button type="button" onClick={() => setNext("pocket")}>
              {zh ? "寻找候选口袋" : "Find candidate pockets"}
            </button>
          )}
      </div>
      <Hint label={zh ? "下一步如何选择？" : "How to choose the next step?"}>
        {zh
          ? "结构可在研究资产中选择并准备模型/链；原始配体先准备状态和三维构象。口袋、结合与活性结论需独立计算或实验。"
          : "Select/preprocess structural models/chains from Research assets. Prepare chemical states and 3D conformers for raw ligands. Pocket, binding and activity conclusions need separate evidence."}
      </Hint>
    </div>
  );
}
