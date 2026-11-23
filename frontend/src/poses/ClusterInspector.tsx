import { useState } from "react";
import { Hint } from "../guided/Hint";
import { ResearchTabs } from "../presentation/ResearchTabs";
import type { Language } from "../types";
import { ClusterCoverage } from "./ClusterCoverage";
import { ClusterMatrix } from "./ClusterMatrix";
import {
  ClusterContactTable,
  ClusterPairTable,
  ClusterPoseTable,
} from "./ClusterTables";
import type {
  ClusterPair,
  ClusterRow,
  PoseClusterResult,
} from "./cluster-types";

export function ClusterInspector({
  result,
  row,
  pair,
  language,
  artifact,
  onPose,
  onPair,
  onReturn,
}: {
  result: PoseClusterResult;
  row: ClusterRow | undefined;
  pair: ClusterPair | null;
  language: Language;
  artifact(name: string): string;
  onPose(row: ClusterRow): void;
  onPair(pair: ClusterPair): void;
  onReturn(): void;
}) {
  const zh = language === "zh";
  const [tab, setTab] = useState("poses");
  return (
    <div className="cluster-analysis">
      <header className="cluster-overview">
        <div className="section-heading">
          <h2>
            {result.clusters.length} {zh ? "个姿势组" : "pose groups"}
          </h2>
          <Hint
            label={
              zh ? "如何解读分群？" : "How should clusters be interpreted?"
            }
          >
            {zh
              ? "以已对齐受体为共同坐标；配体不单独移动叠合。相同化学状态按所选几何/残基接触尺度分群。代表是原始姿势中的中心样本，簇内数量不是结合概率、药效或自由能。"
              : "Receptors define the common frame; ligands are not independently fitted. Identical chemical states cluster at the selected geometric/contact resolution. Representatives are original medoids. Counts are not binding probabilities, potency or free energies."}
          </Hint>
        </div>
        {pair ? (
          <details className="cluster-coverage-disclosure">
            <summary>{zh ? "比较覆盖" : "Comparison coverage"}</summary>
            <ClusterCoverage result={result} language={language} />
          </details>
        ) : (
          <ClusterCoverage result={result} language={language} />
        )}
        <div className="cluster-file-actions">
          {row && (
            <div className="cluster-downloads cluster-selected-downloads">
              <a
                href={artifact(row.pose_artifact)}
                download
                aria-label={zh ? "下载原始姿势" : "Download original pose"}
              >
                {zh ? "姿势 SDF" : "Pose SDF"}
              </a>
              <a
                href={artifact(row.receptor_artifact)}
                download
                aria-label={zh ? "下载配套受体" : "Download paired receptor"}
              >
                {zh ? "受体 PDB" : "Receptor PDB"}
              </a>
            </div>
          )}
          <details className="cluster-export">
            <summary
              aria-label={zh ? "下载分群结果" : "Download clustering files"}
            >
              {zh ? "分群文件" : "Cluster files"}
            </summary>
            <div className="cluster-downloads">
              {(["clusters.csv", "pairs.csv", "contacts.csv"] as const).map(
                (name, index) => (
                  <a key={name} href={artifact(name)} download>
                    {zh
                      ? ["下载分群表", "下载两两比较", "下载全部接触"][index]
                      : [
                          "Download clusters",
                          "Download pair comparisons",
                          "Download all contacts",
                        ][index]}
                  </a>
                ),
              )}
            </div>
          </details>
        </div>
      </header>
      {pair && (
        <div className="cluster-pair-selection">
          <div role="status" className="cluster-pair-metrics">
            <strong>
              {zh ? "姿势 " : "Poses "}
              {pair.left + 1} / {pair.right + 1}
            </strong>
            <span>
              {zh ? "三维差异" : "RMSD"}{" "}
              {pair.rmsd_angstrom === null
                ? "—"
                : pair.rmsd_angstrom.toFixed(3) + " Å"}
            </span>
            <span>
              {zh ? "接触相似度" : "Contact similarity"}{" "}
              {pair.contact_jaccard === null
                ? "—"
                : (pair.contact_jaccard * 100).toFixed(1) + "%"}
            </span>
          </div>
          <button
            type="button"
            className="secondary-button"
            onClick={() => {
              onReturn();
              setTab("poses");
            }}
          >
            {zh ? "返回单个姿势" : "Return to single pose"}
          </button>
        </div>
      )}
      <ResearchTabs
        label={zh ? "分群结果查看" : "Inspect clustering results"}
        active={tab}
        onChange={setTab}
        tabs={[
          {
            id: "poses",
            label: zh ? "姿势" : "Poses",
            content: (
              <div className="cluster-pose-list">
                <ClusterPoseTable
                  result={result}
                  language={language}
                  selected={row?.index ?? -1}
                  onSelect={onPose}
                />
              </div>
            ),
          },
          {
            id: "pairs",
            label: zh ? "配对" : "Pairs",
            content: (
              <ClusterPairTable
                result={result}
                language={language}
                selected={pair}
                onSelect={onPair}
              />
            ),
          },
          {
            id: "map",
            label: zh ? "比较图" : "Map",
            content: (
              <ClusterMatrix
                value={result}
                language={language}
                selected={pair}
                onSelect={onPair}
              />
            ),
          },
          {
            id: "contacts",
            label: zh ? "接触" : "Contacts",
            content: row && (
              <ClusterContactTable row={row} language={language} />
            ),
          },
        ]}
      />
    </div>
  );
}
