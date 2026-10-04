import { useEffect, useState } from "react";
import type { Job, Language } from "../types";
import { artifactUrl } from "../api";
import { preparedEntities, type PreparedEntity } from "./prepared-input-model";
import { StructureViewer } from "../viewer/StructureViewer";
import { ResearchTabs } from "../presentation/ResearchTabs";
import { SequenceTrack } from "../presentation/SequenceTrack";
import { MolecularPreview } from "../presentation/MolecularPreview";
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
  const [inputIndex, setInputIndex] = useState(0);
  const components = "components" in job.request ? job.request.components : [];
  const [converted, setConverted] = useState<PreparedEntity[]>([]),
    [error, setError] = useState(false);
  useEffect(() => {
    const controller = new AbortController();
    setConverted([]);
    setError(false);
    setInputIndex(0);
    if (components.length) return () => controller.abort();
    const timer = setTimeout(() => {
      controller.abort();
      setError(true);
    }, 25000);
    void Promise.all(
      documents.map(async (name) => {
        const response = await fetch(artifactUrl(job.id, name), {
          signal: controller.signal,
        });
        if (
          !response.ok ||
          Number(response.headers.get("content-length")) > 2 * 1024 ** 2
        )
          throw new Error("Unavailable input document");
        const text = await response.text();
        if (text.length > 2 * 1024 ** 2)
          throw new Error("Input document too large");
        return preparedEntities(JSON.parse(text));
      }),
    )
      .then((values) => {
        if (!controller.signal.aborted) setConverted(values.flat());
      })
      .catch(() => {
        if (!controller.signal.aborted) setError(true);
      })
      .finally(() => clearTimeout(timer));
    return () => {
      controller.abort();
      clearTimeout(timer);
    };
  }, [job.id, JSON.stringify(documents), components.length]);
  const entities: PreparedEntity[] = components.length
    ? components.map((component, index) => ({
        label:
          (zh ? "组分 " : "Component ") +
          (index + 1) +
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
    : converted.map((entity, index) => ({
        ...entity,
        label: (zh ? "组分 " : "Component ") + (index + 1),
      }));
  const tabs = entities.map((entity, index) => ({
    id: String(index),
    label: entity.label,
    content: entity.sequence ? (
      <SequenceTrack
        label={entity.label}
        sequence={entity.sequence}
        language={language}
        unit={entity.kind === "protein" ? "aa" : "nt"}
      />
    ) : entity.smiles ? (
      <MolecularPreview
        label={entity.label}
        language={language}
        source={{ smiles: entity.smiles }}
      />
    ) : (
      <p>
        {zh ? "化学组分：" : "Chemical component: "}
        {entity.ccd ?? "—"} · {zh ? "数量：" : "Count: "}
        {entity.count}
      </p>
    ),
  }));
  return (
    <section className="prepared-research-inputs">
      <div className="evidence-material-toolbar">
        <h3>{zh ? "准备好的预测输入" : "Prepared prediction inputs"}</h3>
        {documents.map((name, index) => (
          <a
            className="research-download"
            key={name}
            href={artifactUrl(job.id, name)}
            download
          >
            {zh ? "预测输入" : "Prediction input"} {index + 1} · JSON
          </a>
        ))}
      </div>
      {tabs.length > 0 && (
        <ResearchTabs
          tabs={tabs}
          label={zh ? "输入材料预览" : "Input material views"}
        />
      )}
      {job.request.operation === "json" && job.request.assets.length > 1 && (
        <label>
          {zh ? "查看原始输入" : "Original input"}
          <select
            value={inputIndex}
            onChange={(e) => setInputIndex(Number(e.target.value))}
          >
            {job.request.assets.map((_, index) => (
              <option key={index} value={index}>
                {zh ? "原始结构 " : "Original structure "}
                {index + 1}
              </option>
            ))}
          </select>
        </label>
      )}
      {job.request.operation === "json" && job.request.assets.length > 0 && (
        <StructureViewer
          urls={[
            "/api/assets/" +
              job.request.assets[
                Math.min(inputIndex, job.request.assets.length - 1)
              ],
          ]}
          language={language}
        />
      )}
      {error && (
        <p role="alert" className="field-help">
          {zh
            ? "输入文件暂不可预览，原始文件仍可下载。"
            : "Input preview unavailable; the original documents remain downloadable."}
        </p>
      )}
      <p className="field-help">
        {zh
          ? "下方是本次输入材料；准备输入不产生预测三维构象。将下载的文件带入“导入结构与批量任务”，审阅后可提交预测。"
          : "These are the task's input materials; preparation does not produce predicted 3D conformations. Import the downloaded files in Structure & batch import, then review and submit a prediction."}
      </p>
    </section>
  );
}
