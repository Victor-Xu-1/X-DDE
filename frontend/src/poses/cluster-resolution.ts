import type { Language } from "../types";
import type { ClusterOptions } from "./cluster-types";

type Resolution = Pick<
  ClusterOptions,
  "criterion" | "maximum_rmsd_angstrom" | "minimum_contact_jaccard"
>;

export function clusterCriterionLabel(
  criterion: ClusterOptions["criterion"],
  language: Language,
) {
  return language === "zh"
    ? {
        both: "三维姿势与残基接触",
        geometry: "三维姿势",
        contacts: "对应残基接触",
      }[criterion]
    : {
        both: "3D pose and residue contacts",
        geometry: "3D pose",
        contacts: "Mapped residue contacts",
      }[criterion];
}

export function clusterResolutionLabel(
  options: Resolution,
  language: Language,
) {
  return [
    options.criterion !== "contacts"
      ? `${options.maximum_rmsd_angstrom} Å`
      : "",
    options.criterion !== "geometry"
      ? (language === "zh" ? "接触相似度 ≥" : "contact similarity ≥") +
        `${Math.round(options.minimum_contact_jaccard * 100)}%`
      : "",
  ]
    .filter(Boolean)
    .join(" · ");
}
