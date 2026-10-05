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
import { PotentialResults } from "./PotentialResults";
import { MetricScatter } from "../presentation/MetricScatter";
import { MoleculeImage } from "../presentation/MoleculeImage";
import "./results.css";

export function ScientificResults({
  job,
  result,
  language,
}: {
  job: Job;
  result: NativeResult;
  language: Language;
}) {
  const zh = language === "zh",
    rows = result.candidates;
  const [selected, setSelected] = useState(rows[0]?.id ?? "");
  const active = rows.find((row) => row.id === selected) ?? rows[0];
  const columns = useMemo<ResearchColumn<NativeCandidate>[]>(() => {
    const names = [
      ...new Set(
        rows.flatMap((row) => row.metrics.map((metric) => metric.name)),
      ),
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
      ...names.map((name) => ({
        key: name,
        label: name,
        numeric: true,
        value: (row: NativeCandidate) =>
          row.metrics.find((metric) => metric.name === name)?.value ?? null,
        render: (row: NativeCandidate) => {
          const metric = row.metrics.find((m) => m.name === name);
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
  if (result.program === "plip")
    return <InteractionResults job={job} result={result} language={language} />;
  if (result.program === "apbs")
    return <PotentialResults job={job} result={result} language={language} />;
  const url = active?.artifact ? artifactUrl(job.id, active.artifact) : null;
  const view = active?.smiles ? (
    <MolecularPreview
      language={language}
      label={active.id}
      source={url ? { url, record: 0 } : { smiles: active.smiles }}
      urls={url ? [url] : []}
      defaultView={active.geometry === "none" ? "2d" : "3d"}
    />
  ) : url && /\.(pdb|cif)$/.test(active?.artifact ?? "") ? (
    <StructureViewer urls={[url]} language={language} />
  ) : active?.sequence ? (
    <section className="sequence-display">
      <pre>
        {active.sequence
          .split(/(.{1,60})/)
          .filter(Boolean)
          .join("\n")}
      </pre>
    </section>
  ) : null;
  return (
    <div className="scientific-results">
      {result.validation_points?.length > 1 && (
        <MetricScatter
          rows={result.validation_points}
          language={language}
          label={
            zh
              ? "测试集：实验值与预测值"
              : "Held-out observations and predictions"
          }
          rowId={(r) => r.smiles}
          rowLabel={(r) => r.smiles}
          metrics={[
            {
              key: "observed",
              label: zh ? "实验值" : "Observed",
              value: (r) => r.observed,
            },
            {
              key: "predicted",
              label: zh ? "预测值" : "Predicted",
              value: (r) => r.predicted,
            },
          ]}
        />
      )}
      {result.metrics.length > 0 && (
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
        <div className="results-split">
          <ResearchTable
            rows={rows}
            columns={columns}
            rowId={(row) => row.id}
            language={language}
            title={zh ? "研究候选" : "Research candidates"}
            selected={active?.id}
            onSelect={(row) => setSelected(row.id)}
            exportName="scientific-candidates.csv"
          />
          {view}
        </div>
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
                  .filter((name) =>
                    /\.(sdf|pdb|cif|fasta|csv|dx|pqr|pt)$/.test(name),
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
