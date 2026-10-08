import type { Language } from "../types";
import type { MemberEvidence } from "./types";

export function ReceptorMemberTable({
  members,
  selected,
  language,
  onSelect,
}: {
  members: MemberEvidence[];
  selected: number | null;
  language: Language;
  onSelect(index: number): void;
}) {
  const zh = language === "zh";
  return (
    <div
      className="receptor-member-table"
      role="region"
      tabIndex={0}
      aria-label={zh ? "受体成员" : "Receptor members"}
    >
      <table aria-label={zh ? "受体构象" : "Receptor conformations"}>
        <thead>
          <tr>
            <th scope="col">{zh ? "受体" : "Receptor"}</th>
            <th scope="col">{zh ? "状态" : "Status"}</th>
            <th scope="col">Cα RMSD (Å)</th>
          </tr>
        </thead>
        <tbody>
          {members.map((member) => (
            <tr
              key={member.index}
              className={member.index === selected ? "is-selected" : undefined}
            >
              <th scope="row">
                <button
                  className="result-row-button"
                  type="button"
                  aria-pressed={member.index === selected}
                  onClick={() => onSelect(member.index)}
                >
                  {zh ? "受体 " : "Receptor "}
                  {member.index + 1}
                </button>
              </th>
              <td>
                {member.status === "reference"
                  ? zh
                    ? "参照"
                    : "Reference"
                  : member.status === "aligned"
                    ? zh
                      ? "已对齐"
                      : "Aligned"
                    : zh
                      ? "未通过"
                      : "Rejected"}
              </td>
              <td
                title={
                  member.transformation
                    ? String(member.transformation.rmsd_angstrom)
                    : undefined
                }
              >
                {member.transformation
              ? member.transformation.rmsd_angstrom.toFixed(3)
                  : "—"}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
