import { ResearchTable } from "../presentation/ResearchTable";
import type { Language } from "../types";
import type { SceneInfo } from "../viewer/protocol";
import type {
  ProteinInterfaceResult,
  ProteinInterfaceInteraction,
} from "./types";
import { interactionNames } from "./InteractionResults";
import {
  interactionResidueKey,
  interactionResidueLabel,
  type ContactResidue,
} from "./interaction-residue";

type ContactRow = ProteinInterfaceInteraction & { id: string };

export function ProteinInterfaceContacts({
  active,
  language,
  scene,
  focus,
  onSelect,
}: {
  active: ProteinInterfaceResult;
  language: Language;
  scene: SceneInfo | null;
  focus: { id: string; residue: string } | null;
  onSelect(id: string, residue: string): void;
}) {
  const zh = language === "zh";
  const rows = active.interactions.map((row, index) => ({
    ...row,
    id: String(index),
  }));
  const keyFor = (identity: ContactResidue) =>
    scene && interactionResidueKey(identity, scene.residues);
  function select(row: ContactRow, identity: ContactResidue = row) {
    const residue = keyFor(identity);
    if (residue) onSelect(row.id, residue);
  }
  function endpoint(row: ContactRow, partner: boolean) {
    const identity = partner ? row.partner : row;
    const label = interactionResidueLabel(identity);
    const role = zh
      ? partner
        ? "定位伙伴"
        : "定位靶蛋白"
      : partner
        ? "Focus partner"
        : "Focus target";
    return (
      <button
        type="button"
        className="interface-residue-button interaction-residue"
        aria-label={`${role} ${label}`}
        aria-pressed={
          focus?.id === row.id && focus.residue === keyFor(identity)
        }
        disabled={!keyFor(identity)}
        onClick={() => select(row, identity)}
      >
        {label}
      </button>
    );
  }
  return (
    <ResearchTable<ContactRow>
      language={language}
      title={zh ? "完整界面接触" : "Complete interface contacts"}
      rows={rows}
      rowId={(row) => row.id}
      selected={focus?.id ?? null}
      canSelect={(row) => !!keyFor(row)}
      onSelect={(row) => select(row)}
      columns={[
        {
          key: "target",
          label: zh ? "靶蛋白" : "Target",
          value: interactionResidueLabel,
          render: (row) => endpoint(row, false),
        },
        {
          key: "partner",
          label: zh ? "伙伴" : "Partner",
          value: (row) => interactionResidueLabel(row.partner),
          render: (row) => endpoint(row, true),
        },
        {
          key: "type",
          label: zh ? "作用类型" : "Interaction",
          value: (row) => interactionNames[row.kind]?.[zh ? 0 : 1] ?? row.kind,
        },
        {
          key: "distance",
          label: zh ? "端点距离（Å）" : "Endpoint distance (Å)",
          numeric: true,
          value: (row) => row.distance,
          render: (row) => row.distance.toFixed(2),
        },
      ]}
    />
  );
}
