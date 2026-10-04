import type { Job, Language } from "../types";
import { artifactUrl } from "../api";
import { isPrediction } from "./types";
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
  const components = isPrediction(job.request) ? job.request.components : [];
  const tabs = components.flatMap((component, index) => {
    const label =
      (zh ? "组分 " : "Component ") +
      (index + 1) +
      (component.chain_ids?.length
        ? " · " + component.chain_ids.join(", ")
        : "");
    if (["protein", "dna", "rna"].includes(component.kind) && component.value)
      return [
        {
          id: String(index),
          label,
          content: (
            <SequenceTrack
              label={label}
              sequence={component.value}
              language={language}
              unit={component.kind === "protein" ? "aa" : "nt"}
            />
          ),
        },
      ];
    if (component.kind === "ligand" && component.value)
      return [
        {
          id: String(index),
          label,
          content: (
            <MolecularPreview
              label={label}
              language={language}
              source={{ smiles: component.value }}
            />
          ),
        },
      ];
    return [];
  });
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
      <p className="field-help">
        {zh
          ? "下方是本次输入材料；准备输入不产生预测三维构象。将下载的文件带入“导入结构与批量任务”，审阅后可提交预测。"
          : "These are the task's input materials; preparation does not produce predicted 3D conformations. Import the downloaded files in Structure & batch import, then review and submit a prediction."}
      </p>
    </section>
  );
}
