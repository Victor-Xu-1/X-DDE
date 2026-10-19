import { useState } from "react";
import { artifactUrl } from "../api";
import { StructureWorkbench } from "../presentation/StructureWorkbench";
import { ResearchTable } from "../presentation/ResearchTable";
import { StructureViewer } from "../viewer/StructureViewer";
import type { Job, Language } from "../types";
import type { ProteinInterfaceResult } from "./types";
import { interactionNames } from "./InteractionResults";

export function ProteinInterfaceResults({
  job,
  interfaces,
  language,
}: {
  job: Job;
  interfaces: ProteinInterfaceResult[];
  language: Language;
}) {
  const zh = language === "zh",
    [selected, setSelected] = useState(0);
  const active = interfaces[selected] ?? interfaces[0];
  const [focus, setFocus] = useState<{ residue: string; nonce: number } | null>(
    null,
  );
  const rows = active.interactions.map((row, index) => ({
    ...row,
    id: String(index),
  }));
  return (
    <>
      {interfaces.length > 1 && (
        <label>
          {zh ? "复合物" : "Complex"}
          <select
            value={selected}
            onChange={(e) => {
              setSelected(Number(e.target.value));
              setFocus(null);
            }}
          >
            {interfaces.map((value, index) => (
              <option key={index} value={index}>
                {value.name} · {value.interactions.length}{" "}
                {zh ? "接触" : "contacts"}
              </option>
            ))}
          </select>
        </label>
      )}
      <StructureWorkbench
        preview={
          <StructureViewer
            key={active.structure_artifact}
            sourceSnapshot
            urls={[artifactUrl(job.id, active.structure_artifact)]}
            language={language}
            nativeInteractions={active.interactions}
            focusResidue={focus}
          />
        }
      >
        <h3>{active.name}</h3>
        <p>
          {active.interactions.length} {zh ? "个原生接触" : "native contacts"} ·{" "}
          {active.polymer_residues}{" "}
          {zh ? "个已核对的聚合物残基" : "verified polymer residues"}
        </p>
        <ResearchTable
          language={language}
          title={zh ? "完整界面接触" : "Complete interface contacts"}
          rows={rows}
          rowId={(row) => row.id}
          onSelect={(row) =>
            setFocus({
              residue: `${row.chain}:${row.residue}:${row.number}:${row.insertion_code}`,
              nonce: Date.now(),
            })
          }
          columns={[
            {
              key: "target",
              label: zh ? "靶蛋白" : "Target",
              value: (r) =>
                `${r.chain}:${r.residue}${r.number}${r.insertion_code}`,
            },
            {
              key: "partner",
              label: zh ? "伙伴" : "Partner",
              value: (r) =>
                `${r.partner.chain}:${r.partner.residue}${r.partner.number}${r.partner.insertion_code}`,
            },
            {
              key: "type",
              label: zh ? "作用类型" : "Interaction",
              value: (r) => interactionNames[r.kind]?.[zh ? 0 : 1] ?? r.kind,
            },
            {
              key: "distance",
              label: zh ? "端点距离（Å）" : "Endpoint distance (Å)",
              numeric: true,
              value: (r) => r.distance,
              render: (r) => r.distance.toFixed(2),
            },
          ]}
        />
        <div className="inline-fields">
          {[
            [active.table_artifact, zh ? "接触表 CSV" : "Contacts CSV"],
            [active.text_artifact, zh ? "原生报告 TXT" : "Native report TXT"],
            [active.xml_artifact, zh ? "原生报告 XML" : "Native report XML"],
            [active.structure_artifact, zh ? "原始结构" : "Source structure"],
          ].map(([file, label]) => (
            <a
              key={file}
              className="secondary-button"
              href={artifactUrl(job.id, file)}
              download
            >
              {label}
            </a>
          ))}
        </div>
        <p className="field-help">
          {zh
            ? "原生化学分类，不是结合能或亲和力；水桥距离表示两侧端点的距离。"
            : "Native chemical classifications, not binding energy or affinity. Water-bridge distances refer to the two endpoint atoms."}
        </p>
      </StructureWorkbench>
    </>
  );
}
