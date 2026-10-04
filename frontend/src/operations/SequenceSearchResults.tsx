import { useState } from "react";
import type { SearchHit } from "./native-report";
import { ResearchTable } from "../presentation/ResearchTable";
import { SequenceTrack } from "../presentation/SequenceTrack";
export function SequenceSearchResults({
  hits,
  zh,
}: {
  hits: SearchHit[];
  zh: boolean;
}) {
  const [selected, setSelected] = useState(hits[0]?.accession);
  const current = hits.find((hit) => hit.accession === selected) ?? hits[0];
  if (!current) return null;
  return (
    <section className="sequence-search-results">
      <p className="field-help">
        {zh
          ? "相似序列支持同源或变异线索，不表示对靶点有结合活性。"
          : "Sequence similarity supports homology or variation hypotheses, not target-specific binding."}
      </p>
      <div className="result-master-detail">
        <ResearchTable
          rows={hits}
          language={zh ? "zh" : "en"}
          title={zh ? "相似蛋白序列" : "Similar protein sequences"}
          rowId={(hit) => hit.accession}
          selected={current.accession}
          onSelect={(hit) => setSelected(hit.accession)}
          compare={false}
          columns={[
            {
              key: "accession",
              label: zh ? "蛋白条目" : "Protein entry",
              value: (hit) => hit.accession,
            },
            {
              key: "score",
              label: zh ? "搜索分数" : "Search score",
              value: (hit) => Number(hit.score),
              numeric: true,
            },
            {
              key: "identity",
              label: zh ? "全序列一致性 (%)" : "Overall identity (%)",
              value: (hit) => Number(hit.identity),
              numeric: true,
            },
            {
              key: "aligned",
              label: zh ? "对齐区域一致性 (%)" : "Aligned identity (%)",
              value: (hit) => Number(hit.alignedIdentity),
              numeric: true,
            },
            {
              key: "length",
              label: zh ? "长度 (aa)" : "Length (aa)",
              value: (hit) => Number(hit.length),
              numeric: true,
            },
          ]}
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
