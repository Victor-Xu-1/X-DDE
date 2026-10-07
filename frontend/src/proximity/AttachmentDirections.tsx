import { useState } from "react";
import { artifactUrl } from "../api";
import { Hint } from "../guided/Hint";
import {
  ResearchTable,
  type ResearchColumn,
} from "../presentation/ResearchTable";
import { StructureViewer } from "../viewer/StructureViewer";
import type { Job, Language } from "../types";
import type { AttachmentBond, AssemblyProposal, TernaryResult } from "./types";
export function AttachmentDirections({
  job,
  assembly,
  result,
  language,
}: {
  job: Job;
  assembly: AssemblyProposal;
  result: TernaryResult;
  language: Language;
}) {
  const zh = language === "zh";
  const rows =
    result.attachment_geometry?.assemblies.find((r) => r.id === assembly.id)
      ?.bonds ?? [];
  const [selected, setSelected] = useState<string | null>(
    rows.length <= 2 ? null : (rows[0]?.id ?? null),
  );
  const visible = selected ? rows.filter((row) => row.id === selected) : rows;
  const atom = (row: AttachmentBond, inside: boolean) =>
    (inside ? row.region_element : row.outside_element) +
    String((inside ? row.region_atom : row.outside_atom) + 1);
  const columns: ResearchColumn<AttachmentBond>[] = [
    {
      key: "region",
      label: zh ? "结合端" : "Binding region",
      value: (r) => (zh ? "结合端 " : "Region ") + (r.region === "a" ? 1 : 2),
      render: (r) => (
        <span>{(zh ? "结合端 " : "Region ") + (r.region === "a" ? 1 : 2)}</span>
      ),
    },
    {
      key: "bond",
      label: zh ? "连接原子" : "Bond atoms",
      value: (r) => atom(r, true) + " → " + atom(r, false),
      render: (r) => (
        <button
          type="button"
          className="record-select"
          aria-label={
            (zh ? "查看连接 " : "Inspect bond ") +
            atom(r, true) +
            " → " +
            atom(r, false)
          }
          aria-pressed={selected === r.id}
          onClick={() => setSelected(r.id)}
        >
          {atom(r, true) + " → " + atom(r, false)}
        </button>
      ),
    },
    {
      key: "length",
      label: zh ? "键长 / Å" : "Bond / Å",
      exportLabel: "Current bond length (angstrom)",
      numeric: true,
      value: (r) => r.bond_length_angstrom,
      render: (r) => (
        <span title={String(r.bond_length_angstrom)}>
          {r.bond_length_angstrom.toFixed(3)}
        </span>
      ),
    },
    {
      key: "direction",
      label: zh ? "方向" : "Direction",
      value: (r) =>
        r.direction
          ? zh
            ? "可测量"
            : "Measured"
          : zh
            ? "原子重合"
            : "Coincident atoms",
    },
    ...(["x", "y", "z"] as const).map((axis, i) => ({
      key: axis,
      label: "Direction " + axis,
      numeric: true,
      value: (r: AttachmentBond) => r.direction?.[i] ?? null,
    })),
    {
      key: "source_region_atom",
      label: zh ? "端内原子号" : "Region atom number",
      exportLabel: "Source region atom number (1-based)",
      numeric: true,
      value: (r) => r.region_atom + 1,
    },
    {
      key: "source_outside_atom",
      label: zh ? "端外原子号" : "Outside atom number",
      exportLabel: "Source outside atom number (1-based)",
      numeric: true,
      value: (r) => r.outside_atom + 1,
    },
  ];
  return (
    <div className="attachment-directions">
      <div className="section-heading">
        <h3>{zh ? "连接位点与方向" : "Attachment sites and directions"}</h3>
        <Hint label={zh ? "连接方向说明" : "About attachment directions"}>
          {zh
            ? "箭头沿当前构象中真实的区域边界键，表示已有键的几何方向。箭头长度仅用于显示；不表示允许的生长空间、连接臂通行、反应位点或生物活性。原子编号对应原始分子记录。"
            : "Arrows follow actual region-boundary bonds in this pose. Arrow length is a display aid, not allowed growth, linker clearance, reactivity or activity. Atom numbers refer to the original molecular record."}
        </Hint>
      </div>
      <StructureViewer
        initialMode="pocket"
        urls={[artifactUrl(job.id, assembly.complex_artifact)]}
        language={language}
        attachmentGeometry={{
          points: visible
            .filter((r) => r.direction !== null)
            .map((r) => ({
              origin: r.origin,
              target: r.target,
              fromAtom: result.ligand_atom_indices.indexOf(r.region_atom),
              toAtom: result.ligand_atom_indices.indexOf(r.outside_atom),
              region: r.region,
              label: atom(r, true) + " → " + atom(r, false),
            })),
        }}
      />
      <ResearchTable
        rows={rows}
        columns={columns}
        initialVisibleColumns={["region", "bond", "length", "direction"]}
        rowId={(r) => r.id}
        title={
          zh ? "当前构象的连接位点" : "Attachment sites in the current pose"
        }
        language={language}
        selected={selected}
        onSelect={(r) => setSelected(r.id)}
        compare={false}
        exportName="attachment-bond-geometry.csv"
      />
      {rows.length <= 16 && rows.length > 1 && (
        <button
          type="button"
          className="text-button"
          onClick={() => setSelected(null)}
        >
          {zh ? "同时显示所有连接位点" : "Show all attachment sites"}
        </button>
      )}
    </div>
  );
}
