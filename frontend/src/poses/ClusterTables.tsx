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
      compactToolbar
      columns={[
        { key: "pose", label: zh ? "姿势" : "Pose", value: (r) => r.index + 1 },
        {
          key: "group",
          label: zh ? "模式组" : "Mode",
          value: (r) => membership.get(r.index) ?? "—",
        },
        {
          key: "role",
          label: zh ? "代表" : "Rep.",
          exportLabel: zh ? "代表" : "Representative",
          value: (r) =>
            reps.has(r.index) ? (zh ? "代表" : "Representative") : "—",
          render: (r) =>
            reps.has(r.index) ? (
              <abbr title={zh ? "代表姿势" : "Representative pose"}>
                {zh ? "代表" : "Rep."}
              </abbr>
            ) : (
              "—"
            ),
        },
        {
          key: "receptor",
          label: zh ? "受体" : "Rec.",
          exportLabel: zh ? "受体" : "Receptor",
          value: (r) => r.member_index + 1,
        },
        {
          key: "mapped",
          label: zh ? "接触" : "Contacts",
          exportLabel: zh ? "对应接触" : "Mapped contacts",
          numeric: true,
          value: (r) => r.mapped_contact_count,
          render: (r) => (
            <span
              title={
                zh
                  ? "可对应残基数 / 全部接触残基数"
                  : "Mapped residues / all contact residues"
              }
            >
              {r.mapped_contact_count} / {r.contact_count}
            </span>
          ),
        },
      ]}
    />
  );
}
export function ClusterPairTable({
  result,
  language,
  selected,
  onSelect,
}: {
  result: PoseClusterResult;
  language: Language;
  selected: ClusterPair | null;
  onSelect(pair: ClusterPair): void;
}) {
  const zh = language === "zh";
  return (
    <ResearchTable
      rows={result.pairs}
      language={language}
      rowId={(p) => p.left + ":" + p.right}
      selected={selected ? selected.left + ":" + selected.right : undefined}
      compare={false}
      compactToolbar
      onSelect={onSelect}
      title={zh ? "两两姿势比较" : "Pairwise pose comparison"}
      columns={[
        {
          key: "pair",
          label: zh ? "配对" : "Pair",
          exportLabel: zh ? "比较姿势" : "Pose pair",
          value: (p) => p.left + 1 + " ↔ " + (p.right + 1),
        },
        {
          key: "geometry",
          label: "RMSD (Å)",
          exportLabel: zh ? "三维差异（Å）" : "3D difference (Å)",
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
          label: zh ? "化学状态" : "State",
          exportLabel: zh ? "化学状态" : "Chemical state",
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

function residueLabel(residue: ClusterRow["contacts"][number]["residue"]) {
  return residue.chain + ":" + residue.number + residue.insertion_code;
}

export function ClusterContactTable({
  row,
  language,
}: {
  row: ClusterRow;
  language: Language;
}) {
  const zh = language === "zh";
  return (
    <>
      <p className="cluster-contact-context">
        {zh ? "姿势 " : "Pose "}
        {row.index + 1} · {row.contacts.length} / {row.contact_count}{" "}
        {zh ? "几何接触" : "geometric contacts"}
      </p>
      <ResearchTable
        rows={row.contacts}
        language={language}
        rowId={(contact) => JSON.stringify(contact.residue)}
        compare={false}
        compactToolbar
        title={zh ? "接触残基与距离" : "Contact residues and distances"}
        columns={[
          {
            key: "residue",
            label: zh ? "受体残基" : "Paired residue",
            exportLabel: zh ? "配套受体残基" : "Paired receptor residue",
            value: (r) => residueLabel(r.residue),
          },
          {
            key: "reference",
            label: zh ? "参照残基" : "Mapped residue",
            exportLabel: zh ? "对应参照残基" : "Mapped reference residue",
            value: (r) =>
              r.reference_residue ? residueLabel(r.reference_residue) : "—",
          },
          {
            key: "distance",
            label: zh ? "距离（Å）" : "Distance (Å)",
            exportLabel: zh
              ? "最近重原子距离（Å）"
              : "Nearest heavy-atom distance (Å)",
            numeric: true,
            value: (r) => r.distance_angstrom,
            render: (r) => r.distance_angstrom.toFixed(2),
          },
        ]}
      />
    </>
  );
}
