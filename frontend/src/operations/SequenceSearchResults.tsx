import { useState } from "react";
import type { SearchHit } from "./native-report";
import { ResearchTable } from "../presentation/ResearchTable";
import { SequenceTrack } from "../presentation/SequenceTrack";
import { StructureWorkbench } from "../presentation/StructureWorkbench";
import "../discovery/target-desktop.css";
export function SequenceSearchResults({
  hits,
  zh,
  structureSearch = false,
}: {
  hits: SearchHit[];
  zh: boolean;
  structureSearch?: boolean;
}) {
  const [selected, setSelected] = useState(hits[0]?.accession);
  const current = hits.find((hit) => hit.accession === selected) ?? hits[0];
  if (!current) return null;
  const language = zh ? "zh" : "en";
  const inspector = (
    <div className="result-inspector">
      <header>
        <h3>{current.accession}</h3>
        <a
          href={
            "https://www.uniprot.org/uniprotkb/" +
            encodeURIComponent(current.accession) +
            "/entry"
          }
          target="_blank"
          rel="noreferrer"
        >
          {zh ? "查看来源" : "View source"}
        </a>
      </header>
      {current.sequence && (
        <SequenceTrack
          compact
          sequence={current.sequence}
          language={language}
          label={current.accession}
        />
      )}
      {current.alternatives && (
        <details>
          <summary>
            {zh ? "来源中的变异线索" : "Source variation evidence"}
          </summary>
          <p className="field-help">
            {zh ? "原生零起始位置：" : "Native zero-based positions: "}
            {current.alternatives}
          </p>
        </details>
      )}
    </div>
  );
  const table = (
    <ResearchTable
      rows={hits}
      language={language}
      compactToolbar
      initialVisibleColumns={
        structureSearch ? undefined : ["accession", "score"]
      }
      title={
        structureSearch
          ? zh
            ? "抗体样检索条目"
            : "Antibody-domain hits"
          : zh
            ? "相似蛋白序列"
            : "Similar protein sequences"
      }
      rowId={(hit) => hit.accession}
      selected={current.accession}
      onSelect={(hit) => setSelected(hit.accession)}
      compare={false}
      columns={[
        {
          key: "accession",
          label: zh ? "条目" : "Entry",
          exportLabel: zh ? "蛋白条目" : "Protein entry",
          value: (hit: SearchHit) => hit.accession,
        },
        {
          key: "score",
          label: zh ? "搜索分数" : "Search score",
          value: (hit: SearchHit) => Number(hit.score),
          numeric: true,
        },
        {
          key: "identity",
          label: zh ? "全序列一致性 (%)" : "Overall identity (%)",
          value: (hit: SearchHit) =>
            hit.identity ? Number(hit.identity) : null,
          numeric: true,
        },
        {
          key: "aligned",
          label: zh ? "对齐区域一致性 (%)" : "Aligned identity (%)",
          value: (hit: SearchHit) =>
            hit.alignedIdentity ? Number(hit.alignedIdentity) : null,
          numeric: true,
        },
        {
          key: "length",
          label: zh ? "长度 (aa)" : "Length (aa)",
          value: (hit: SearchHit) => (hit.length ? Number(hit.length) : null),
          numeric: true,
        },
      ].filter(
        (column) =>
          !structureSearch || !["identity", "aligned"].includes(column.key),
      )}
    />
  );
  return (
    <section
      className="sequence-search-results"
      data-search-kind={structureSearch ? "structure" : "sequence"}
    >
      <details className="sequence-search-scope">
        <summary>{zh ? "检索结果说明" : "Interpret search results"}</summary>
        <p className="field-help">
          {structureSearch
            ? zh
              ? "三维窗口显示查询结构。命中列表用于比较本次检索的排序，命中详情提供来源序列。TM-score、RMSD、亲和力及功能需独立评估。"
              : "The 3D viewer shows the query structure. Use search scores to compare ranks within this run. Hit details contain source sequences. Assess TM-score, RMSD, affinity and function separately."
            : zh
              ? "序列相似性提供同源和变异线索。靶点结合活性需独立验证。"
              : "Sequence similarity supports homology and variation hypotheses. Establish target-specific binding separately."}
        </p>
      </details>
      {structureSearch ? (
        <div className="sequence-search-rail">
          {table}
          {inspector}
        </div>
      ) : (
        <StructureWorkbench preview={inspector}>{table}</StructureWorkbench>
      )}
    </section>
  );
}
