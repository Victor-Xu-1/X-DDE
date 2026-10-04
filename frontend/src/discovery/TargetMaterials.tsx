import { artifactUrl } from "../api";
import { defaults } from "../form-model";
import type { Job, Language, Prediction } from "../types";
import { SequenceTrack } from "../presentation/SequenceTrack";
import { ResearchTable } from "../presentation/ResearchTable";
import type { TargetResearchResult } from "./types";
import type { ReferenceSelection } from "./ReferenceImportForm";
export function TargetMaterials({
  job,
  result,
  language,
  onDraft,
  onImport,
}: {
  job: Job;
  result: TargetResearchResult;
  language: Language;
  onDraft?(request: Prediction): void;
  onImport?(selection: ReferenceSelection): void;
}) {
  const zh = language === "zh",
    title =
      result.entity.approvedSymbol ?? result.entity.name ?? result.entity.id;
  return (
    <div className="target-materials">
      {result.materials.map((m) => (
        <section key={m.accession}>
          <div className="evidence-material-toolbar">
            <h3>{m.accession}</h3>
            <a
              className="secondary-button"
              href={artifactUrl(job.id, m.artifact)}
              download
            >
              {zh ? "下载靶点序列" : "Download target sequence"}
            </a>
            {onDraft && (
              <button
                type="button"
                className="primary-button"
                disabled={
                  !m.reference ||
                  !/^[ACDEFGHIKLMNPQRSTVWYX]{1,5000}$/.test(m.sequence)
                }
                onClick={() =>
                  onDraft({
                    name: title.slice(0, 80),
                    components: [
                      {
                        kind: "protein",
                        value: m.sequence,
                        count: 1,
                        source_sequence: m.reference?.asset_id,
                      },
                    ],
                    scientific_inputs: m.reference ? [m.reference] : [],
                    parameters: { ...defaults },
                  })
                }
              >
                {zh
                  ? "用这条序列预测结构"
                  : "Predict structure from this sequence"}
              </button>
            )}
          </div>
          <SequenceTrack
            sequence={m.sequence}
            label={zh ? "靶点序列" : "Target sequence"}
            language={language}
          />
          <p className="field-help">
            {zh
              ? "来源数据库的规范序列；异构体、突变体及实验构建体需要另外核对。"
              : "Canonical source sequence. Check isoforms, mutants and experimental constructs separately."}
          </p>
          <h3>
            {zh ? "实验结构索引" : "Experimental structure references"} ·{" "}
            {m.structures.length} / {m.structure_total}
          </h3>
          <ResearchTable
            rows={m.structures}
            rowId={(row) => row.id}
            language={language}
            title={zh ? "实验结构索引" : "Experimental structure references"}
            compare={false}
            columns={[
              {
                key: "pdb",
                label: "PDB",
                value: (row) => row.id,
                render: (row) => (
                  <a
                    href={
                      "https://www.rcsb.org/structure/" +
                      encodeURIComponent(row.id)
                    }
                    target="_blank"
                    rel="noreferrer"
                  >
                    {row.id}
                  </a>
                ),
              },
              {
                key: "description",
                label: zh ? "结构信息" : "Structure information",
                value: (row) => row.properties.map((p) => p.value).join(" · "),
              },
              {
                key: "import",
                label: zh ? "下一步" : "Next step",
                sortable: false,
                value: (row) => row.id,
                render: (row) =>
                  onImport && result.analysis_reference ? (
                    <button
                      type="button"
                      className="secondary-button"
                      onClick={() =>
                        onImport({
                          source: "pdb",
                          identifier: row.id,
                          evidence: result.analysis_reference,
                        })
                      }
                    >
                      {zh ? "导入结构" : "Import structure"}
                    </button>
                  ) : null,
              },
            ]}
          />
        </section>
      ))}
      {!result.materials.length && (
        <p className="result-empty">
          {zh
            ? "这次查询没有返回可展示的序列或结构索引。"
            : "This query returned no displayable sequence or structure references."}
        </p>
      )}
    </div>
  );
}
