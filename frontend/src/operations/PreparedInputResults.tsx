import { useState } from "react";
import type { Job, Language } from "../types";
import { artifactUrl } from "../api";
import { MoleculeImage } from "../presentation/MoleculeImage";
import { ResearchTabs } from "../presentation/ResearchTabs";
import { SequenceTrack } from "../presentation/SequenceTrack";
import { StructureWorkbench } from "../presentation/StructureWorkbench";
import { StructureViewer } from "../viewer/StructureViewer";
import type { PreparedEntity } from "./prepared-input-model";
import { usePreparedDocuments } from "./usePreparedDocuments";
import "./prepared-input-results.css";

export function PreparedInputResults({
  job,
  documents,
  language,
}: {
  job: Job;
  documents: string[];
  language: Language;
}) {
  const zh = language === "zh";
  const [selection, setSelection] = useState({ jobId: job.id, index: 0 });
  const inputIndex = selection.jobId === job.id ? selection.index : 0;
  const components = "components" in job.request ? job.request.components : [];
  const recorded = usePreparedDocuments(job.id, documents, !components.length);
  const inputLabel = (index: number) =>
    (zh ? "组分 " : "Component ") + (index + 1);
  const entities: PreparedEntity[] = components.length
    ? components.map((component, index) => ({
        label:
          inputLabel(index) +
          (component.chain_ids?.length
            ? " · " + component.chain_ids.join(", ")
            : ""),
        kind: component.kind,
        count: component.count,
        sequence: ["protein", "rna", "dna"].includes(component.kind)
          ? component.value
          : undefined,
        smiles:
          component.kind === "ligand" && !component.value.startsWith("CCD_")
            ? component.value.replace(/^SMILES_/, "")
            : undefined,
        ccd:
          component.kind === "ligand" && component.value.startsWith("CCD_")
            ? component.value.slice(4)
            : undefined,
      }))
    : recorded.rows.map((row, index) => ({ ...row, label: inputLabel(index) }));
  const tabs = entities.map((entity, index) => ({
    id: String(index),
    label: entity.label,
    content: (
      <PreparedInputEntity
        entity={entity}
        language={language}
        standalone={entities.length === 1}
      />
    ),
  }));
  const originalAssets =
    job.request.operation === "json" ? job.request.assets : [];
  const selectedAsset =
    originalAssets[Math.min(inputIndex, originalAssets.length - 1)];
  const title = zh ? "准备好的预测输入" : "Prepared prediction inputs";
  const links = documents.map((name, index) => {
    const label = `${zh ? "预测输入" : "Prediction input"} ${index + 1} · JSON`;
    return (
      <a
        className="research-download"
        key={name}
        href={artifactUrl(job.id, name)}
        aria-label={label}
        download
      >
        {documents.length === 1 ? "JSON ↓" : label}
      </a>
    );
  });
  return (
    <section className="prepared-research-inputs" aria-label={title}>
      <StructureWorkbench
        toolbar={
          <header className="prepared-input-toolbar">
            <h3>{zh ? title : "Prepared inputs"}</h3>
            {links.length > 1 ? (
              <details className="prepared-input-documents">
                <summary>
                  {zh ? "原始 JSON" : "Original JSON"} ({links.length})
                </summary>
                <div>{links}</div>
              </details>
            ) : (
              links
            )}
          </header>
        }
        preview={
          selectedAsset ? (
            <section
              className="prepared-input-source"
              aria-label={zh ? "原始输入结构" : "Original input structure"}
            >
              {originalAssets.length > 1 && (
                <label>
                  {zh ? "查看原始输入" : "Original input"}
                  <select
                    value={inputIndex}
                    onChange={(event) =>
                      setSelection({
                        jobId: job.id,
                        index: Number(event.target.value),
                      })
                    }
                  >
                    {originalAssets.map((_, index) => (
                      <option key={index} value={index}>
                        {zh ? "原始结构" : "Original structure"} {index + 1}
                      </option>
                    ))}
                  </select>
                </label>
              )}
              <StructureViewer
                urls={["/api/assets/" + encodeURIComponent(selectedAsset)]}
                language={language}
                sourceSnapshot
              />
            </section>
          ) : null
        }
      >
        {tabs.length > 1 ? (
          <ResearchTabs
            tabs={tabs}
            label={zh ? "输入材料预览" : "Input material views"}
          />
        ) : (
          tabs[0]?.content
        )}
        {recorded.loading && (
          <p role="status">
            {zh ? "正在读取输入材料…" : "Loading input materials…"}
          </p>
        )}
        {recorded.unavailable && (
          <p role="status" className="field-help">
            {tabs.length > 0
              ? zh
                ? "部分输入无法预览。原始 JSON 仍可下载。"
                : "Some inputs cannot be previewed. The original JSON files are available to download."
              : zh
                ? "无法预览输入材料。原始 JSON 仍可下载。"
                : "The inputs cannot be previewed. The original JSON files are available to download."}
          </p>
        )}
        <p className="field-help">
          {zh
            ? "准备输入不产生预测三维构象。可在「导入结构与批量任务」中使用下载的 JSON。"
            : "Input preparation does not produce predicted 3D structures. Use the downloaded JSON in Structure & batch import."}
        </p>
      </StructureWorkbench>
    </section>
  );
}

function PreparedInputEntity({
  entity,
  language,
  standalone,
}: {
  entity: PreparedEntity;
  language: Language;
  standalone: boolean;
}) {
  const zh = language === "zh";
  if (entity.sequence) {
    const label = !standalone
      ? entity.label
      : entity.kind === "protein"
        ? zh
          ? "蛋白序列"
          : "Protein sequence"
        : entity.kind.toUpperCase() + (zh ? " 序列" : " sequence");
    return (
      <SequenceTrack
        label={label}
        recordName={entity.label}
        sequence={entity.sequence}
        language={language}
        unit={entity.kind === "protein" ? "aa" : "nt"}
      />
    );
  }
  if (entity.smiles)
    return (
      <MoleculeImage
        label={entity.label}
        language={language}
        source={{ smiles: entity.smiles }}
      />
    );
  return (
    <p>
      {zh ? "化学组分：" : "Chemical component: "}
      {entity.ccd ?? "—"} · {zh ? "数量：" : "Count: "}
      {entity.count}
    </p>
  );
}
