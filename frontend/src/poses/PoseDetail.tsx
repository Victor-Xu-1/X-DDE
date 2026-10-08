import { MolecularPreview } from "../presentation/MolecularPreview";
import type { Language } from "../types";
import type { PoseSet } from "./types";

export function PoseDetail({
  outcome,
  record,
  language,
  onNext,
}: {
  outcome: PoseSet["outcomes"][number];
  record: number | null;
  language: Language;
  onNext(choice: "properties" | "score"): void;
}) {
  const zh = language === "zh";
  const selected = outcome.poses.find(
    (pose) => pose.evidence.record === record && pose.reference,
  );
  if (!selected?.reference)
    return (
      <div className="ensemble-empty-preview" role="status">
        <strong>{zh ? "没有可查看的姿势" : "No pose to inspect"}</strong>
        <p>
          {zh
            ? "选择一个有结果的组合。"
            : "Select a combination with available results."}
        </p>
      </div>
    );
  const ligand = selected.reference,
    receptor = outcome.combination.receptor;
  return (
    <section
      className="pose-detail"
      aria-label={zh ? "所选姿势" : "Selected pose"}
    >
      <header className="ensemble-result-heading">
        <h3>
          {zh ? "姿势 " : "Pose "}
          {selected.evidence.record + 1}
        </h3>
        <a href={"/api/assets/" + ligand.asset_id} download>
          {zh ? "下载此姿势" : "Download this pose"}
        </a>
      </header>
      <MolecularPreview
        key={outcome.combination.step_id + ":" + selected.evidence.record}
        defaultView="3d"
        label={(zh ? "姿势 " : "Pose ") + (selected.evidence.record + 1)}
        source={
          selected.evidence.smiles
            ? { smiles: selected.evidence.smiles }
            : { url: "/api/assets/" + ligand.asset_id, record: ligand.record }
        }
        urls={[
          "/api/assets/" + receptor.asset_id,
          "/api/assets/" + ligand.asset_id,
        ]}
        records={[receptor.record, ligand.record]}
        focusModel={1}
        language={language}
      />
      <div className="editor-toolbar">
        <button
          className="secondary-button"
          type="button"
          onClick={() => onNext("properties")}
        >
          {zh ? "计算此姿势分子性质" : "Calculate molecular properties"}
        </button>
        <button
          className="secondary-button"
          type="button"
          onClick={() => onNext("score")}
        >
          {zh ? "在配套受体上重新评分" : "Rescore with paired receptor"}
        </button>
      </div>
    </section>
  );
}
