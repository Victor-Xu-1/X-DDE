import { MoleculeImage } from "../presentation/MoleculeImage";
import type { Language } from "../types";
import type { TargetResearchResult } from "./types";

type Activity = NonNullable<TargetResearchResult["activities"]>["rows"][number];

/** Inspect the selected source activity; depiction never creates a computed pose. */
export function ActivityMoleculePreview({
  activity,
  language,
}: {
  activity: Activity;
  language: Language;
}) {
  const zh = language === "zh";
  return (
    <section
      className="activity-molecule-preview"
      aria-label={zh ? "选中记录的分子结构" : "Selected reported molecule"}
    >
      <h3>{activity.molecule_chembl_id}</h3>
      <p className="field-help" title={activity.assay_description}>
        {activity.standard_type} {activity.standard_relation ?? ""}{" "}
        {activity.standard_value ?? "—"} {activity.standard_units ?? ""}
        {" · "}
        {activity.assay_chembl_id}
      </p>
      {activity.canonical_smiles ? (
        <>
          <MoleculeImage
            key={String(activity.activity_id)}
            source={{ smiles: activity.canonical_smiles }}
            label={activity.molecule_chembl_id}
            language={language}
          />
          <p className="field-help">
            {zh
              ? "来源记录的二维结构；未生成三维构象。"
              : "Source-record 2D structure; no 3D conformer has been generated."}
          </p>
        </>
      ) : (
        <p className="result-empty">
          {zh
            ? "来源记录未提供分子结构。"
            : "The source record does not provide a molecular structure."}
        </p>
      )}
    </section>
  );
}
