import { artifactUrl } from "../api";
import { MoleculeImage } from "../presentation/MoleculeImage";
import { ResearchTable } from "../presentation/ResearchTable";
import type { Job, Language } from "../types";
import type { FreeEnergyResult } from "./types";

export function MoleculeMapPanel({
  job,
  edge,
  nodes,
  language,
}: {
  job: Job;
  edge: FreeEnergyResult["edges"][number];
  nodes: readonly [
    FreeEnergyResult["nodes"][number],
    FreeEnergyResult["nodes"][number],
  ];
  language: Language;
}) {
  const zh = language === "zh",
    [a, b] = nodes;
  return (
    <section>
      <div className="simulation-molecule-pair">
        {[a, b].map((node, i) => (
          <div key={node.id}>
            <h4>
              {i === 0 ? "A" : "B"} · {node.id}
            </h4>
            <MoleculeImage
              source={{
                url: artifactUrl(job.id, node.artifact),
                record: 0,
              }}
              language={language}
              label={node.id}
            />
          </div>
        ))}
      </div>
      <dl className="simulation-readouts">
        <div>
          <dt>{zh ? "对应原子" : "Mapped atoms"}</dt>
          <dd>{edge.atom_map.length}</dd>
        </div>
        <div>
          <dt>{zh ? "映射适合度" : "Mapping suitability"}</dt>
          <dd>{edge.mapping_score.toFixed(3)}</dd>
        </div>
        {edge.delta_delta_g_kcal_mol != null && (
          <div>
            <dt>ΔΔG ± uncertainty</dt>
            <dd>
              {edge.delta_delta_g_kcal_mol.toFixed(2)} ±{" "}
              {edge.uncertainty_kcal_mol?.toFixed(2)} <small>kcal/mol</small>
            </dd>
          </div>
        )}
      </dl>
      <details className="simulation-method">
        <summary>{zh ? "查看原子对应" : "Inspect atom correspondence"}</summary>
        <ResearchTable
          rows={edge.atom_map.map(([ai, bi]) => ({ a: ai, b: bi }))}
          language={language}
          title={zh ? "原子映射" : "Atom map"}
          rowId={(r) => String(r.a)}
          exportName="atom-map.csv"
          columns={[
            {
              key: "a",
              label: zh
                ? "A 原子索引（从 0 开始）"
                : "A atom index (zero-based)",
              value: (r) => r.a,
            },
            {
              key: "b",
              label: zh
                ? "B 原子索引（从 0 开始）"
                : "B atom index (zero-based)",
              value: (r) => r.b,
            },
          ]}
        />
      </details>
    </section>
  );
}
