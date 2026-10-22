import { useState } from "react";
import type { SearchHit } from "./native-report";
import { ResearchTable } from "../presentation/ResearchTable";
import { SequenceTrack } from "../presentation/SequenceTrack";
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
  return (
    <section className="sequence-search-results">
      <p className="field-help">
        {structureSearch
          ? zh
            ? "抗体样结构检索线索；搜索分数不是 TM-score、RMSD、亲和力或功能验证。下方展示来源序列，不补造候选三维结构。"
            : "Antibody-domain retrieval evidence. Search scores are not TM-score, RMSD, affinity or functional validation. Source sequences are shown; hit structures are not fabricated."
          : zh
            ? "相似序列支持同源或变异线索，不表示对靶点有结合活性。"
            : "Sequence similarity supports homology or variation hypotheses, not target-specific binding."}
      </p>
      <div
        className="result-master-detail"
        style={structureSearch ? { gridTemplateColumns: "1fr" } : undefined}
      >
        <ResearchTable
          rows={hits}
          language={zh ? "zh" : "en"}
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
              label: zh ? "蛋白条目" : "Protein entry",
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
              value: (hit: SearchHit) =>
                hit.length ? Number(hit.length) : null,
              numeric: true,
            },
          ].filter(
            (column) =>
              !structureSearch || !["identity", "aligned"].includes(column.key),
          )}
        />
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
              sequence={current.sequence}
              language={zh ? "zh" : "en"}
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
      </div>
    </section>
  );
}
