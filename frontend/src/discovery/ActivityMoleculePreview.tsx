import { MoleculeImage } from "../presentation/MoleculeImage";
import { useState } from "react";
import type { Language } from "../types";
import type { TargetResearchResult } from "./types";

type Activity = NonNullable<TargetResearchResult["activities"]>["rows"][number];

export function ActivityValidityNote({
  comment,
  language,
}: {
  comment?: string | null;
  language: Language;
}) {
  if (!comment?.trim()) return null;
  return (
    <small className="evidence-description" role="note">
      <strong>
        {language === "zh" ? "来源有效性备注：" : "Source validity note: "}
      </strong>
      {comment}
    </small>
  );
}

/** Inspect the selected source activity; depiction never creates a computed pose. */
export function ActivityMoleculePreview({
  activity,
  language,
  onImport,
}: {
  activity: Activity;
  language: Language;
  onImport?(): void;
}) {
  const zh = language === "zh";
  const [message, setMessage] = useState("");
  async function copySmiles() {
    if (!activity.canonical_smiles) return;
    let text: string;
    try {
      await navigator.clipboard.writeText(activity.canonical_smiles);
      text = zh ? "分子结构已复制。" : "Molecular structure copied.";
    } catch {
      text = zh
        ? "复制失败，请从原始结果读取结构。"
        : "Copy failed; use the original result.";
    }
    setMessage(text);
  }
  return (
    <section
      className="activity-molecule-preview"
      aria-label={zh ? "选中记录的分子结构" : "Selected reported molecule"}
    >
      <header className="activity-preview-header">
        <div>
          <h3>{activity.molecule_chembl_id}</h3>
          <p className="field-help" title={activity.assay_description}>
            {activity.standard_type} {activity.standard_relation ?? ""}{" "}
            {activity.standard_value ?? "—"} {activity.standard_units ?? ""}
            {" · "}
            {activity.assay_chembl_id}
          </p>
        </div>
        <div className="evidence-row-actions">
          {onImport && (
            <button
              type="button"
              className="secondary-button"
              onClick={onImport}
            >
              {zh ? "导入化合物" : "Import compound"}
            </button>
          )}
          {activity.canonical_smiles && (
            <button
              type="button"
              className="secondary-button"
              onClick={copySmiles}
            >
              {zh ? "复制分子结构" : "Copy SMILES"}
            </button>
          )}
        </div>
      </header>
      <ActivityValidityNote
        comment={activity.data_validity_comment}
        language={language}
      />
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
      {message && <p role="status">{message}</p>}
    </section>
  );
}
