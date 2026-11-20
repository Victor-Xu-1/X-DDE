import { FollowupBackendControl } from "../utilities/TaskBackendControl";
import { StructureWorkbench } from "../presentation/StructureWorkbench";
import { useCallback, useRef, useState } from "react";
import { artifactUrl } from "../api";
import { ReferenceArchivePreview } from "./ReferenceArchivePreview";
import { StructurePrepareForm } from "../receptors/StructurePrepareForm";
import { PocketForm } from "../pockets/PocketForm";
import { StateForm } from "../chemistry/StateForm";
import { Hint } from "../guided/Hint";
import type { MoleculeRef } from "../research/types";
import type { Job, Language } from "../types";
import "./reference-import.css";
import "./target-desktop.css";
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
    [next, setNext] = useState<{
      source: string;
      step: "pocket" | "states" | "prepare";
    } | null>(null);
  const sourceKey = JSON.stringify([
    job.id,
    result.artifact,
    result.sha256,
    result.kind,
  ]);
  const currentSource = useRef(sourceKey);
  currentSource.current = sourceKey;
  const [verifiedSource, setVerifiedSource] = useState<string | null>(null);
  const onVerified = useCallback(
    (ready: boolean) => {
      if (currentSource.current === sourceKey)
        setVerifiedSource(ready ? sourceKey : null);
    },
    [sourceKey],
  );
  const ready =
    verifiedSource === sourceKey &&
    result.reference?.sha256.toLowerCase() === result.sha256.toLowerCase();
  const openNext = (step: "pocket" | "states" | "prepare") =>
    setNext({ source: sourceKey, step });
  if (next?.source === sourceKey && result.reference && onCreated)
    return (
      <section>
        <button
          type="button"
          className="secondary-button"
          onClick={() => setNext(null)}
        >
          {zh ? "返回参考材料" : "Back to reference material"}
        </button>
        <FollowupBackendControl
          language={language}
          capability={
            next.step === "prepare"
              ? "biopython.prepare"
              : next.step === "states"
                ? "chemistry.states"
                : "p2rank.detect"
          }
        />
        {next.step === "prepare" ? (
          <StructurePrepareForm
            language={language}
            onCreated={onCreated}
            initialStructure={result.reference}
          />
        ) : next.step === "states" ? (
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
    <div className="discovery-results reference-import-results">
      <StructureWorkbench
        preview={
          <ReferenceArchivePreview
            key={sourceKey}
            result={result}
            url={artifactUrl(job.id, result.artifact)}
            language={language}
            onVerified={onVerified}
          />
        }
      >
        <h3>{result.identifier}</h3>
        <p className="field-help">
          {zh
            ? "原始参考材料，计算前请先准备。"
            : "Original reference; prepare before computation."}
        </p>
        <div className="reference-import-actions">
          {result.reference && onCreated && (
            <button
              type="button"
              className="primary-button"
              disabled={!ready}
              onClick={() =>
                openNext(result.kind === "structure" ? "prepare" : "states")
              }
            >
              {result.kind === "structure"
                ? zh
                  ? "准备研究结构"
                  : "Prepare research structure"
                : zh
                  ? "准备分子"
                  : "Prepare molecule"}
            </button>
          )}
          <a
            className="secondary-button"
            href={artifactUrl(job.id, result.artifact)}
            download
          >
            {zh ? "下载源文件" : "Download source file"}
          </a>
          {result.reference &&
            onCreated &&
            result.kind === "structure" &&
            result.request.format === "pdb" && (
              <button
                type="button"
                className="secondary-button"
                disabled={!ready}
                onClick={() => openNext("pocket")}
              >
                {zh ? "寻找候选口袋" : "Find candidate pockets"}
              </button>
            )}
        </div>
        <Hint label={zh ? "下一步如何选择？" : "How to choose the next step?"}>
          {zh
            ? "结构可在研究资产中选择并准备模型/链；原始配体先准备状态和三维构象。口袋、结合与活性结论需独立计算或实验。"
            : "Select/preprocess structural models/chains from Research assets. Prepare chemical states and 3D conformers for raw ligands. Pocket, binding and activity conclusions need separate evidence."}
        </Hint>
      </StructureWorkbench>
    </div>
  );
}
