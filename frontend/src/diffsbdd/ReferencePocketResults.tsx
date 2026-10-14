import { StructureWorkbench } from "../presentation/StructureWorkbench";
import { artifactUrl } from "../api";
import type { Job, Language } from "../types";
import type { OperationResult } from "../operations/types";
import { StructureViewer } from "../viewer/StructureViewer";
import { referencePocketResidues } from "./reference-pocket";

export function ReferencePocketResults({
  job,
  data,
  language,
}: {
  job: Job;
  data: OperationResult;
  language: Language;
}) {
  const zh = language === "zh";
  const protein =
    typeof data.protein_artifact === "string" ? data.protein_artifact : null;
  const reference =
    typeof data.reference_artifact === "string" &&
    (data.ligand_status as { state?: string } | undefined)?.state === "verified"
      ? data.reference_artifact
      : null;
  const residues = referencePocketResidues(data.residues);
  const definition =
    job.request.operation === "diffsbdd" ? job.request.payload.pocket : null;
  const ligandDefined = Boolean(
    definition &&
    typeof definition === "object" &&
    "kind" in definition &&
    ["ligand", "bound_ligand"].includes(String(definition.kind)),
  );
  return (
    <section
      aria-label={zh ? "参考口袋检查结果" : "Reference pocket inspection"}
    >
      <StructureWorkbench
        preview={
          protein && (
            <StructureViewer
              urls={[
                artifactUrl(job.id, protein),
                ...(reference ? [artifactUrl(job.id, reference)] : []),
              ]}
              language={language}
              comparison={false}
              residueRegion={residues}
              initialMode={reference ? "pocket" : "cartoon"}
              focusModel={reference ? 1 : undefined}
            />
          )
        }
      >
        <p role={residues.length ? "status" : "alert"}>
          {residues.length
            ? `${zh ? "选区残基" : "Region residues"}: ${residues.length}`
            : zh
              ? "无法核对口袋残基，请检查原始结果文件。"
              : "Pocket residue identities are unavailable; inspect the original result files."}
        </p>
        {ligandDefined && (
          <p className="field-help">
            {zh
              ? "参考配体周围 8 Å 的研究区域；不代表新分子的结合预测。"
              : "An 8 Å region around the reference ligand; not a new molecule's binding prediction."}
          </p>
        )}
        <details>
          <summary>{zh ? "查看口袋残基" : "Inspect pocket residues"}</summary>
          <table>
            <thead>
              <tr>
                <th>{zh ? "链" : "Chain"}</th>
                <th>{zh ? "残基编号" : "Residue number"}</th>
              </tr>
            </thead>
            <tbody>
              {residues.map((row) => (
                <tr key={`${row.chain}:${row.number}`}>
                  <td>{row.chain}</td>
                  <td>{row.number}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </details>
      </StructureWorkbench>
    </section>
  );
}
