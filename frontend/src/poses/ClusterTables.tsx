import { ResearchTable } from "../presentation/ResearchTable";
import type { Language } from "../types";
import type {
  ClusterPair,
  ClusterRow,
  PoseClusterResult,
} from "./cluster-types";
export function ClusterPoseTable({
  result,
  language,
  selected,
  onSelect,
}: {
  result: PoseClusterResult;
  language: Language;
  selected: number;
  onSelect(row: ClusterRow): void;
}) {
  const zh = language === "zh",
    membership = new Map(
      result.clusters.flatMap((g) => g.members.map((i) => [i, g.id] as const)),
    ),
    reps = new Set(result.clusters.map((g) => g.representative));
  return (
    <ResearchTable
      rows={result.rows}
      language={language}
      rowId={(r) => String(r.index)}
      title={zh ? "姿势与代表结构" : "Poses and representatives"}
      selected={String(selected)}
      onSelect={onSelect}
      compare={false}
      columns={[
        { key: "pose", label: zh ? "姿势" : "Pose", value: (r) => r.index + 1 },
        {
          key: "group",
          label: zh ? "模式组" : "Mode",
          value: (r) => membership.get(r.index) ?? "—",
        },
        {
          key: "role",
          label: zh ? "代表" : "Representative",
          value: (r) =>
            reps.has(r.index) ? (zh ? "代表" : "Representative") : "—",
        },
        {
          key: "receptor",
          label: zh ? "受体" : "Receptor",
          value: (r) => r.member_index + 1,
        },
        {
          key: "contacts",
          label: zh ? "接触残基" : "Contact residues",
          numeric: true,
          value: (r) => r.contact_count,
        },
        {
          key: "mapped",
          label: zh ? "可比接触" : "Mapped contacts",
          numeric: true,
          value: (r) => r.mapped_contact_count,
        },
      ]}
    />
  );
}
export function ClusterPairTable({
  result,
  language,
  onSelect,
}: {
  result: PoseClusterResult;
  language: Language;
  onSelect(pair: ClusterPair): void;
}) {
  const zh = language === "zh";
  return (
    <ResearchTable
      rows={result.pairs}
      language={language}
      rowId={(p) => p.left + ":" + p.right}
      compare={false}
      onSelect={onSelect}
      title={zh ? "两两姿势比较" : "Pairwise pose comparison"}
      columns={[
        {
          key: "pair",
          label: zh ? "比较姿势" : "Pose pair",
          value: (p) => p.left + 1 + " ↔ " + (p.right + 1),
        },
        {
          key: "geometry",
          label: zh ? "三维差异（Å）" : "3D difference (Å)",
          numeric: true,
          value: (p) => p.rmsd_angstrom,
          render: (p) =>
            p.rmsd_angstrom === null ? "—" : p.rmsd_angstrom.toFixed(2),
        },
        {
          key: "contacts",
          label: zh ? "接触相似度" : "Contact similarity",
          numeric: true,
          value: (p) => p.contact_jaccard,
          render: (p) =>
            p.contact_jaccard === null
              ? "—"
              : (p.contact_jaccard * 100).toFixed(1) + "%",
        },
        {
          key: "state",
          label: zh ? "化学状态" : "Chemical state",
          value: (p) =>
            p.same_chemical_graph
              ? zh
                ? "相同"
                : "Same"
              : zh
                ? "不同"
                : "Different",
        },
      ]}
    />
  );
}
