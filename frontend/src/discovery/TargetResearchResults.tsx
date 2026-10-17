import { useState } from "react";
import type { Job, Language, Prediction } from "../types";
import {
  ReferenceImportForm,
  type ReferenceSelection,
} from "./ReferenceImportForm";
import { TargetResearchForm } from "./TargetResearchForm";
import type { EvidenceHit, TargetResearchResult } from "./types";
import { ResearchTabs } from "../presentation/ResearchTabs";
import { AssociationResults } from "./AssociationResults";
import { TargetMaterials } from "./TargetMaterials";
import { ActivityResults } from "./ActivityResults";
import { EvidenceSummary } from "./EvidenceSummary";
import "./discovery.css";

export function TargetResearchResults({
  job,
  result,
  language,
  onDraft,
  onCreated,
}: {
  job: Job;
  result: TargetResearchResult;
  language: Language;
  onDraft?(request: Prediction): void;
  onCreated?(job: Job): void;
}) {
  const zh = language === "zh",
    [next, setNext] = useState<EvidenceHit | null>(null),
    [material, setMaterial] = useState<ReferenceSelection | null>(null);
  const association =
    result.entity.associatedTargets ?? result.entity.associatedDiseases;
  if (material && onCreated)
    return (
      <section>
        <button
          type="button"
          className="secondary-button"
          onClick={() => setMaterial(null)}
        >
          {zh ? "返回靶点证据" : "Back to target evidence"}
        </button>
        <ReferenceImportForm
          key={material.identifier}
          language={language}
          onCreated={onCreated}
          initial={material}
        />
      </section>
    );
  if (next && onCreated)
    return (
      <section>
        <button
          type="button"
          className="secondary-button"
          onClick={() => setNext(null)}
        >
          {zh ? "返回疾病结果" : "Back to disease results"}
        </button>
        <TargetResearchForm
          key={next.id}
          entity="target"
          initialSelection={next}
          language={language}
          onCreated={onCreated}
        />
      </section>
    );
  const tabs = [
    ...(association
      ? [
          {
            id: "associations",
            label:
              result.request.entity === "disease"
                ? zh
                  ? "相关靶点"
                  : "Associated targets"
                : zh
                  ? "疾病关联"
                  : "Disease associations",
            count: association.rows.length,
            content: (
              <AssociationResults
                value={association}
                language={language}
                onTarget={onCreated ? setNext : undefined}
              />
            ),
          },
        ]
      : []),
    ...(result.request.entity === "disease"
      ? []
      : [
          {
            id: "materials",
            label: zh ? "序列与实验结构" : "Sequences & structures",
            count: result.materials.length,
            content: (
              <TargetMaterials
                job={job}
                result={result}
                language={language}
                onDraft={onDraft}
                onImport={onCreated ? setMaterial : undefined}
              />
            ),
          },
          {
            id: "activities",
            label: zh ? "已有实测活性" : "Reported activities",
            count: result.activities?.rows.length ?? 0,
            content: (
              <ActivityResults
                result={result}
                language={language}
                onImport={onCreated ? setMaterial : undefined}
              />
            ),
          },
          {
            id: "modalities",
            label: zh ? "干预线索" : "Modality evidence",
            content: (
              <section className="result-section-card">
                <h3>
                  {zh
                    ? "不同药物形式的干预线索"
                    : "Modality-specific tractability evidence"}
                </h3>
                <div className="tractability-cards">
                  {result.entity.tractability
                    ?.filter((row) => row.value)
                    .map((row) => (
                      <div key={row.modality + row.label}>
                        <span>
                          {(
                            {
                              SM: zh ? "小分子" : "Small molecules",
                              AB: zh ? "抗体" : "Antibodies",
                              PR: zh ? "蛋白降解" : "Protein degradation",
                              OC: zh ? "寡核苷酸" : "Oligonucleotides",
                            } as Record<string, string>
                          )[row.modality] ?? row.modality}
                        </span>
                        <strong>{row.label}</strong>
                      </div>
                    ))}
                </div>
                <p className="field-help">
                  {zh
                    ? "来源数据库的证据标签；未列出不等于不可干预。"
                    : "Source evidence labels. Unlisted items do not establish intractability."}
                </p>
              </section>
            ),
          },
        ]),
  ];
  return (
    <div className="discovery-results">
      <EvidenceSummary result={result} language={language} />
      {tabs.length <= 1 ? (
        tabs[0]?.content
      ) : (
        <ResearchTabs
          tabs={tabs}
          label={zh ? "靶点研究结果" : "Target research results"}
        />
      )}
    </div>
  );
}
