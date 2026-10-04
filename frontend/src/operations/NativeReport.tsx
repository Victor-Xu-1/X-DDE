import { SequenceSearchResults } from "./SequenceSearchResults";
import { sequenceHits, contactReport } from "./native-report";
import { researchText } from "../presentation/research-content";
import { harnessCandidateSource } from "../presentation/task-sources";
import { StructureViewer } from "../viewer/StructureViewer";
import type { Job } from "../types";
import { InteractionDiagram } from "../presentation/InteractionDiagram";
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
  if (hits.length) return <SequenceSearchResults hits={hits} zh={zh} />;
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
            <InteractionDiagram
              language={zh ? "zh" : "en"}
              label={report.name}
              edges={report.contacts.map((edge) => ({
                left: edge.left,
                right: edge.right,
                kind: edge.kind,
                distance: Number.isFinite(Number(edge.distance))
                  ? Number(edge.distance)
                  : null,
              }))}
            />
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
