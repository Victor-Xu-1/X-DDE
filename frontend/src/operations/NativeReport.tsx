import { sequenceHits, contactReport } from "./native-report";
import { researchText } from "../presentation/research-content";
import { harnessCandidateSource } from "../presentation/task-sources";
import { StructureViewer } from "../viewer/StructureViewer";
import type { Job } from "../types";
const types: Record<string, string> = {
  hydrophobic: "疏水接触",
  hbond: "氢键",
  saltbridge: "盐桥",
  pistack: "芳环堆积",
  pication: "阳离子–π",
};
export function NativeReport({
  text,
  zh,
  job,
}: {
  text: string;
  zh: boolean;
  job?: Job;
}) {
  const hits = sequenceHits(text),
    reports = contactReport(text);
  if (hits.length)
    return (
      <section>
        <p className="field-help">
          {zh
            ? "相似序列支持同源或变异线索，不表示对靶点有结合活性。"
            : "Sequence similarity supports homology or variation hypotheses, not target-specific binding."}
        </p>
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                {(zh
                  ? [
                      "蛋白条目",
                      "搜索分数",
                      "全序列一致性",
                      "对齐区域一致性",
                      "长度",
                    ]
                  : [
                      "Protein entry",
                      "Search score",
                      "Overall identity",
                      "Aligned identity",
                      "Length",
                    ]
                ).map((h) => (
                  <th key={h}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {hits.map((h) => (
                <tr key={h.accession}>
                  <th>
                    <a
                      href={
                        "https://www.uniprot.org/uniprotkb/" +
                        encodeURIComponent(h.accession) +
                        "/entry"
                      }
                      target="_blank"
                      rel="noreferrer"
                    >
                      {h.accession}
                    </a>
                    <details>
                      <summary>
                        {zh
                          ? "序列与变异线索"
                          : "Sequence & variation evidence"}
                      </summary>
                      <p className="sequence-cell">{h.sequence}</p>
                      <p>
                        {zh
                          ? "原始零起始位置："
                          : "Native zero-based positions: "}
                        {h.alternatives}
                      </p>
                    </details>
                  </th>
                  <td>{h.score}</td>
                  <td>{h.identity}%</td>
                  <td>{h.alignedIdentity}%</td>
                  <td>{h.length} aa</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <details>
          <summary>{zh ? "完整检索报告" : "Complete search report"}</summary>
          <pre className="native-result-report">{researchText(text, zh)}</pre>
        </details>
      </section>
    );
  if (reports.length)
    return (
      <section>
        <p className="field-help">
          {zh
            ? "PLIP 识别的结构接触；接触数量和距离不是作用能或亲和力。"
            : "PLIP structural contacts; counts and distances are not interaction energy or affinity."}
        </p>
        {reports.map((report) => (
          <article key={report.name}>
            <h3>{report.name}</h3>
            <p>
              {zh ? "识别接触" : "Contacts identified"}:{" "}
              {report.counts.total ?? "—"}
            </p>
            {job && harnessCandidateSource(job, report.name) && (
              <StructureViewer
                urls={[
                  "/api/assets/" +
                    harnessCandidateSource(job, report.name)!.asset_id,
                ]}
                language={zh ? "zh" : "en"}
              />
            )}
            <div className="table-scroll">
              <table>
                <thead>
                  <tr>
                    {(zh
                      ? ["结合体残基", "靶标残基", "接触类型", "距离（Å）"]
                      : [
                          "Binder residue",
                          "Target residue",
                          "Contact type",
                          "Distance (Å)",
                        ]
                    ).map((h) => (
                      <th key={h}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {report.contacts.map((c, i) => (
                    <tr key={i}>
                      <td>{c.left}</td>
                      <td>{c.right}</td>
                      <td>{zh ? (types[c.kind] ?? c.kind) : c.kind}</td>
                      <td>{c.distance}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <details>
              <summary>
                {zh ? "原始报告摘要" : "Original report summary"}
              </summary>
              <pre className="native-result-report">
                {researchText(text, zh)}
              </pre>
            </details>
          </article>
        ))}
      </section>
    );
  return text.length > 240 ? (
    <pre className="native-result-report">{researchText(text, zh)}</pre>
  ) : (
    <p>{researchText(text, zh)}</p>
  );
}
