import type { Language } from "../types";
import type { PoseClusterResult } from "./cluster-types";

/** Count only actual finite native comparisons; unavailable evidence is not zero. */
export function ClusterCoverage({
  result,
  language,
}: {
  result: PoseClusterResult;
  language: Language;
}) {
  const zh = language === "zh";
  const total = result.pairs.length;
  const geometric = result.pairs.filter(
    (pair) =>
      pair.rmsd_angstrom !== null && Number.isFinite(pair.rmsd_angstrom),
  ).length;
  const contacts = result.pairs.filter(
    (pair) =>
      pair.contact_jaccard !== null && Number.isFinite(pair.contact_jaccard),
  ).length;
  const missingContacts = total - contacts;
  return (
    <div className="cluster-coverage">
      <dl aria-label={zh ? "两两比较覆盖情况" : "Pairwise comparison coverage"}>
        <div>
          <dt>{zh ? "姿势" : "Poses"}</dt>
          <dd>{result.rows.length}</dd>
        </div>
        <div>
          <dt>{zh ? "几何可比" : "Geometry comparable"}</dt>
          <dd>
            {geometric} / {total}
          </dd>
        </div>
        <div>
          <dt>{zh ? "接触可比" : "Contacts comparable"}</dt>
          <dd>
            {contacts} / {total}
          </dd>
        </div>
      </dl>
      {missingContacts > 0 && (
        <p
          role="status"
          aria-label={zh ? "接触比较可用性" : "Contact comparison availability"}
          className="cluster-comparison-note"
        >
          {zh
            ? `${missingContacts} / ${total} 对姿势的接触无法比较。缺失比较不会当作零相似度；分组表示当前尺度下的计算样本。`
            : `Contact comparison is unavailable for ${missingContacts} of ${total} pose pairs. Missing comparisons are not zero similarity; groups describe the sampled poses.`}
        </p>
      )}
    </div>
  );
}
