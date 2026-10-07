import { useState } from "react";
import { artifactUrl } from "../api";
import { ResearchTable } from "../presentation/ResearchTable";
import { MolecularPreview } from "../presentation/MolecularPreview";
import { StructureViewer } from "../viewer/StructureViewer";
import { Hint } from "../guided/Hint";
import type { Job, Language } from "../types";
import type {
  ClusterPair,
  ClusterRow,
  PoseClusterResult,
} from "./cluster-types";
import { ClusterMatrix } from "./ClusterMatrix";
import { ClusterPoseTable, ClusterPairTable } from "./ClusterTables";
import "./cluster.css";
export function ClusterResults({
  job,
  result,
  language,
}: {
  job: Job;
  result: PoseClusterResult;
  language: Language;
}) {
  const zh = language === "zh",
    [selected, setSelected] = useState(result.clusters[0]?.representative ?? 0),
    [pair, setPair] = useState<ClusterPair | null>(null);
  const row = result.rows[selected];
  const url = (name: string) => artifactUrl(job.id, name);
  function select(value: ClusterRow) {
    setSelected(value.index);
    setPair(null);
  }
  function selectPair(value: ClusterPair) {
    setSelected(value.left);
    setPair(value);
  }
  return (
    <section
      className="cluster-results"
      aria-label={zh ? "结合模式分群结果" : "Binding mode clustering results"}
    >
      <div className="section-heading">
        <h2>
          {result.clusters.length} {zh ? "组结合模式" : "binding-mode groups"}
        </h2>
        <Hint
          label={zh ? "如何解读分群？" : "How should clusters be interpreted?"}
        >
          {zh
            ? "以已对齐受体为共同坐标；配体不单独移动叠合。相同化学状态按所选几何/残基接触尺度分群。代表是原始姿势中的中心样本，簇内数量不是结合概率、药效或自由能。"
            : "Receptors define the common frame; ligands are not independently fitted. Identical chemical states cluster at the selected geometric/contact resolution. Representatives are original medoids. Counts are not binding probabilities, potency or free energies."}
        </Hint>
      </div>
      <div className="cluster-downloads">
        {(["clusters.csv", "pairs.csv", "contacts.csv"] as const).map(
          (name, i) => (
            <a key={name} href={url(name)} download>
              {zh
                ? ["下载分群表", "下载两两比较", "下载全部接触"][i]
                : [
                    "Download clusters",
                    "Download pair comparisons",
                    "Download all contacts",
                  ][i]}
            </a>
          ),
        )}
      </div>
      <div className="cluster-result-columns">
        <div className="cluster-analysis">
          <ClusterPoseTable
            result={result}
            language={language}
            selected={selected}
            onSelect={select}
          />
          <ClusterMatrix
            value={result}
            language={language}
            onSelect={selectPair}
          />
          <ClusterPairTable
            result={result}
            language={language}
            onSelect={selectPair}
          />
        </div>
        {row && (
          <div className="cluster-preview">
            {pair ? (
              <>
                <StructureViewer
                  urls={[
                    url("frame.pdb"),
                    url(result.rows[pair.left].pose_artifact),
                    url(result.rows[pair.right].pose_artifact),
                  ]}
                  language={language}
                  comparison={true}
                  records={[0, 0, 0]}
                />
                <p>
                  {zh ? "姿势 " : "Pose "}
                  {pair.left + 1} / {pair.right + 1} ·{" "}
                  {zh ? "三维差异" : "3D difference"}{" "}
                  {pair.rmsd_angstrom === null
                    ? "—"
                    : pair.rmsd_angstrom.toFixed(3) + " Å"}{" "}
                  · {zh ? "接触相似度" : "Contact similarity"}{" "}
                  {pair.contact_jaccard === null
                    ? "—"
                    : (pair.contact_jaccard * 100).toFixed(1) + "%"}
                </p>
                <button
                  type="button"
                  className="secondary-button"
                  onClick={() => setPair(null)}
                >
                  {zh
                    ? "查看单个姿势与配套受体"
                    : "Inspect a single pose with its paired receptor"}
                </button>
              </>
            ) : (
              <MolecularPreview
                language={language}
                label={(zh ? "姿势 " : "Pose ") + (row.index + 1)}
                source={{
                  url: "/api/assets/" + row.reference.asset_id,
                  record: row.reference.record,
                }}
                defaultView="3d"
                urls={[
                  "/api/assets/" + row.receptor.asset_id,
                  "/api/assets/" + row.reference.asset_id,
                ]}
                records={[0, 0]}
                focusModel={1}
              />
            )}
            <div className="cluster-downloads">
              <a href={url(row.pose_artifact)} download>
                {zh ? "下载原始姿势" : "Download original pose"}
              </a>
              <a href={url(row.receptor_artifact)} download>
                {zh ? "下载配套受体" : "Download paired receptor"}
              </a>
            </div>
          </div>
        )}
      </div>
      {row && (
        <details>
          <summary>
            {zh ? "当前姿势的关键几何接触" : "Current pose geometric contacts"}{" "}
            · {row.contacts.length} / {row.contact_count}
          </summary>
          <ResearchTable
            rows={row.contacts}
            language={language}
            rowId={(r) => JSON.stringify(r.residue)}
            compare={false}
            title={zh ? "接触残基与距离" : "Contact residues and distances"}
            columns={[
              {
                key: "residue",
                label: zh ? "配套受体残基" : "Paired receptor residue",
                value: (r) =>
                  r.residue.chain +
                  ":" +
                  r.residue.number +
                  r.residue.insertion_code,
              },
              {
                key: "reference",
                label: zh ? "对应参照残基" : "Mapped reference residue",
                value: (r) =>
                  r.reference_residue
                    ? r.reference_residue.chain +
                      ":" +
                      r.reference_residue.number +
                      r.reference_residue.insertion_code
                    : "—",
              },
              {
                key: "distance",
                label: zh
                  ? "最近重原子距离（Å）"
                  : "Nearest heavy-atom distance (Å)",
                numeric: true,
                value: (r) => r.distance_angstrom,
                render: (r) => r.distance_angstrom.toFixed(2),
              },
            ]}
          />
        </details>
      )}
    </section>
  );
}
