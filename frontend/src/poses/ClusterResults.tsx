import { useState } from "react";
import { artifactUrl } from "../api";
import { MolecularPreview } from "../presentation/MolecularPreview";
import { StructureWorkbench } from "../presentation/StructureWorkbench";
import type { Job, Language } from "../types";
import { StructureViewer } from "../viewer/StructureViewer";
import { ClusterInspector } from "./ClusterInspector";
import type {
  ClusterPair,
  ClusterRow,
  PoseClusterResult,
} from "./cluster-types";
import "./cluster.css";
import "../presentation/pose-review-workspace.css";

export function ClusterResults({
  job,
  result,
  language,
}: {
  job: Job;
  result: PoseClusterResult;
  language: Language;
}) {
  const zh = language === "zh";
  const [selected, setSelected] = useState(
    result.clusters[0]?.representative ?? 0,
  );
  const [pair, setPair] = useState<ClusterPair | null>(null);
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
      className="cluster-results pose-review-workspace"
      aria-label={zh ? "结合模式分群结果" : "Binding mode clustering results"}
    >
      <StructureWorkbench
        preview={
          row && (
            <div className="cluster-preview">
              {pair ? (
                <StructureViewer
                  urls={[
                    url("frame.pdb"),
                    url(result.rows[pair.left].pose_artifact),
                    url(result.rows[pair.right].pose_artifact),
                  ]}
                  language={language}
                  comparison={true}
                  focusModels={[1, 2]}
                  records={[0, 0, 0]}
                />
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
            </div>
          )
        }
      >
        <ClusterInspector
          result={result}
          row={row}
          pair={pair}
          language={language}
          artifact={url}
          onPose={select}
          onPair={selectPair}
          onReturn={() => setPair(null)}
        />
      </StructureWorkbench>
    </section>
  );
}
