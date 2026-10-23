import { StructureWorkbench } from "../presentation/StructureWorkbench";
import { useMemo, useState } from "react";
import { artifactUrl } from "../api";
import {
  ResearchTable,
  type ResearchColumn,
} from "../presentation/ResearchTable";
import { MolecularPreview } from "../presentation/MolecularPreview";
import { StructureViewer } from "../viewer/StructureViewer";
import { ResearchTabs } from "../presentation/ResearchTabs";
import type { Job, Language } from "../types";
import type { NativeCandidate, NativeResult } from "./types";
import { InteractionResults } from "./InteractionResults";
import { ProteinInterfaceResults } from "./ProteinInterfaceResults";
import { PotentialResults } from "./PotentialResults";
import { ProximityResults } from "../proximity/Results";
import { PropertyModelResults } from "./PropertyModelResults";
import { BoundPropertyModelEvidence } from "./PropertyModelEvidence";
import { MoleculeImage } from "../presentation/MoleculeImage";
import "./results.css";
import { DynamicsResults } from "../simulations/DynamicsResults";
import { FreeEnergyResults } from "../simulations/FreeEnergyResults";
import { SequenceDesignOverview } from "./SequenceDesignOverview";
import { isInternalResearchFile } from "../presentation/research-files";
import { BinderQuality } from "./BinderQuality";

const ENERGY_NAMES: Record<string, readonly [string, string]> = {
  "Initial potential energy": ["优化前势能", "Initial energy"],
  "Final potential energy": ["优化后势能", "Final energy"],
};

export function ScientificResults({
  job,
  result,
  language,
  onCreated,
  initialCandidateId,
}: {
  job: Job;
  result: NativeResult;
  language: Language;
  onCreated?(job: Job): void;
  initialCandidateId?: string;
}) {
  const zh = language === "zh",
    rows = result.candidates;
  const initial = initialCandidateId ?? rows[0]?.id ?? "";
  const [choice, setChoice] = useState({ job: job.id, initial, id: initial });
  const selected =
    choice.job === job.id && choice.initial === initial ? choice.id : initial;
  const setSelected = (id: string) => setChoice({ job: job.id, initial, id });
  const active = rows.find((row) => row.id === selected) ?? rows[0];
  const columns = useMemo<ResearchColumn<NativeCandidate>[]>(() => {
    const metrics = [
      ...new Map(
        rows
          .flatMap((row) => row.metrics)
          .map((metric) => [
            JSON.stringify([metric.name, metric.unit]),
            metric,
          ]),
      ).values(),
    ];
    return [
      { key: "id", label: zh ? "候选" : "Candidate", value: (row) => row.id },
      ...(rows.some((r) => r.smiles)
        ? [
            {
              key: "molecule",
              label: zh ? "结构" : "Structure",
              value: (r: NativeCandidate) => r.smiles ?? "",
              render: (r: NativeCandidate) =>
                r.smiles ? (
                  <MoleculeImage
                    compact
                    source={{ smiles: r.smiles }}
                    language={language}
                    label={r.id}
                  />
                ) : null,
            },
          ]
        : []),
      ...metrics.map(({ name, unit }) => ({
        key: JSON.stringify([name, unit]),
        label: (
          <strong className="native-metric-heading" title={name}>
            {ENERGY_NAMES[name]?.[zh ? 0 : 1] ?? name}
            {unit && <small>{unit}</small>}
          </strong>
        ),
        exportLabel: unit ? `${name} (${unit})` : name,
        numeric: true,
        value: (row: NativeCandidate) =>
          row.metrics.find(
            (metric) => metric.name === name && metric.unit === unit,
          )?.value ?? null,
        render: (row: NativeCandidate) => {
          const metric = row.metrics.find(
            (m) => m.name === name && m.unit === unit,
          );
          return metric ? (
            <span title={`${metric.method} · ${metric.unit}`}>
              {metric.value.toPrecision(4)}
            </span>
          ) : (
            "—"
          );
        },
      })),
    ];
  }, [rows, zh]);
  if (initialCandidateId && !rows.some((row) => row.id === initialCandidateId))
    return (
      <p role="alert" className="error">
        {zh
          ? "已复核的候选无法读取，请刷新或重新核对示例。"
          : "The reviewed candidate is unavailable. Refresh or review this example again."}
      </p>
    );
  if (
    ["molecular_dynamics", "gromacs_dynamics"].includes(result.operation) &&
    result.dynamics
  )
    return (
      <DynamicsResults
        key={job.id}
        job={job}
        result={result.dynamics}
        language={language}
        files={result.artifact_sha256}
      />
    );
  if (result.operation === "binding_free_energy" && result.free_energy)
    return (
      <FreeEnergyResults
        key={job.id}
        job={job}
        result={result.free_energy}
        language={language}
        files={result.artifact_sha256}
        protein={result.structure_artifact}
        onCreated={onCreated}
      />
    );
  if (result.operation === "protein_interface" && result.protein_interfaces)
    return (
      <ProteinInterfaceResults
        key={job.id}
        job={job}
        interfaces={result.protein_interfaces}
        language={language}
      />
    );
  if (result.program === "plip")
    return <InteractionResults job={job} result={result} language={language} />;
  if (result.program === "apbs")
    return <PotentialResults job={job} result={result} language={language} />;
  if (result.program === "deepternary" && result.proximity)
    return (
      <ProximityResults
        job={job}
        result={result.proximity}
        language={language}
      />
    );
  const url = active?.artifact ? artifactUrl(job.id, active.artifact) : null;
  const complexUrl =
    active?.geometry === "source_frame" && result.structure_artifact
      ? artifactUrl(job.id, result.structure_artifact)
      : null;
  const sequence = active?.sequence ? (
    <section className="sequence-display">
      <pre>{active.sequence.match(/.{1,60}/g)?.join("\n")}</pre>
    </section>
  ) : null;
  const view = active?.smiles ? (
    <MolecularPreview
      language={language}
      label={active.id}
      // Keep the native chemical graph used by the thumbnail. A 3D editor import
      // can infer stereochemistry not declared in the generated molecule.
      source={{ smiles: active.smiles }}
      urls={complexUrl ? [complexUrl] : url ? [url] : []}
      defaultView={active.geometry === "none" ? "2d" : "3d"}
    />
  ) : url && /\.(pdb|cif)$/.test(active?.artifact ?? "") ? (
    sequence ? (
      <ResearchTabs
        label={zh ? "候选预览" : "Candidate preview"}
        tabs={[
          {
            id: "structure",
            label: zh ? "三维结构" : "3D structure",
            content: <StructureViewer urls={[url]} language={language} />,
          },
          {
            id: "sequence",
            label: zh ? "序列" : "Sequence",
            content: sequence,
          },
        ]}
      />
    ) : (
      <StructureViewer urls={[url]} language={language} />
    )
  ) : (
    sequence
  );
  return (
    <div className="scientific-results">
      {result.operation === "chemprop_train" && (
        <PropertyModelResults result={result} language={language} />
      )}
      {result.operation !== "chemprop_train" && result.metrics.length > 0 && (
        <table className="compact-table">
          <tbody>
            {result.metrics.map((metric) => (
              <tr key={metric.name}>
                <th title={metric.method}>{metric.name}</th>
                <td>
                  {metric.value.toPrecision(4)} {metric.unit}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {rows.length > 0 && (
        <>
          {result.sequence_design && (
            <SequenceDesignOverview
              result={result.sequence_design}
              selected={active?.id ?? ""}
              zh={zh}
            />
          )}
          <StructureWorkbench preview={view}>
            {result.program === "boltzgen" &&
              (result.binder_quality ? (
                <BinderQuality
                  report={result.binder_quality}
                  jobId={job.id}
                  selected={active?.id ?? ""}
                  language={language}
                />
              ) : (
                <p role="status">
                  {zh
                    ? "缺少完整原生筛选报告，无法确认候选是否合格。"
                    : "The complete native filter report is unavailable; candidate qualification is unconfirmed."}
                </p>
              ))}
            {result.operation === "chemprop_predict" && (
              <BoundPropertyModelEvidence
                payload={
                  job.request?.operation === "chemprop_predict"
                    ? job.request.payload
                    : { kind: "chemprop", mode: "predict" }
                }
                language={language}
              />
            )}
            <ResearchTable
              rows={rows}
              columns={columns}
              initialVisibleColumns={columns
                .slice(0, 4)
                .map((column) => column.key)}
              rowId={(row) => row.id}
              language={language}
              title={zh ? "研究候选" : "Research candidates"}
              selected={active?.id}
              onSelect={(row) => setSelected(row.id)}
              exportName="scientific-candidates.csv"
            />
          </StructureWorkbench>
        </>
      )}
      {result.model_artifact && (
        <section>
          <h3>{zh ? "研究模型已保存" : "Research model saved"}</h3>
          <p>
            {zh
              ? "可在“用研究模型预测性质”中选择此模型，预测新分子。"
              : "Choose this model in Predict with a research model to evaluate new molecules."}
          </p>
        </section>
      )}
      <ResearchTabs
        label={zh ? "研究文件" : "Research files"}
        tabs={[
          {
            id: "files",
            label: zh ? "下载文件" : "Download files",
            content: (
              <div className="download-actions">
                {Object.keys(result.artifact_sha256)
                  .filter(
                    (name) =>
                      /\.(sdf|pdb|cif|fasta|csv|dx|pqr|pt)$/.test(name) &&
                      !isInternalResearchFile(name),
                  )
                  .map((name) => (
                    <a
                      className="secondary-button"
                      key={name}
                      href={artifactUrl(job.id, name)}
                      download
                    >
                      {name}
                    </a>
                  ))}
              </div>
            ),
          },
        ]}
      />
    </div>
  );
}
