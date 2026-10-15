import type { ReactNode } from "react";
import type { Language } from "../types";
import type { MoleculeRef } from "../research/types";
import { MoleculeImage } from "../presentation/MoleculeImage";
import { StructureWorkbench } from "../presentation/StructureWorkbench";
import { ReviewReference } from "../diffsbdd/ReviewReference";
import {
  reinventModes,
  usesStartingMolecule,
  usesScaffoldOrigin,
} from "./reinvent-modes";
import type { ScientificPayload, ScientificTask } from "./types";

/** Review the actual chemical scope; never imply fixed coordinates or binding. */
export function ReinventReview({
  language,
  payload,
  ligand,
  options,
}: {
  language: Language;
  payload: ScientificPayload;
  ligand: MoleculeRef | null;
  options?: ScientificTask["options"];
}) {
  const zh = language === "zh";
  const range = (value: unknown) =>
    Array.isArray(value) ? value.join("–") : "—";
  const mode = reinventModes.find(([id]) => id === payload.mode);
  const fragments =
    ["r_groups", "linker"].includes(String(payload.mode)) &&
    Array.isArray(payload.fragments)
      ? (payload.fragments as string[])
      : [];
  const starting = usesStartingMolecule(payload) ? ligand : null;
  const origin = usesScaffoldOrigin(payload) ? ligand : null;
  const rows: [string, ReactNode][] = [
    [zh ? "设计方式" : "Design method", mode?.[zh ? 1 : 2] ?? "—"],
    [zh ? "计算程序" : "Scientific program", "REINVENT4"],
  ];
  if (starting)
    rows.push([
      zh ? "起始分子" : "Starting molecule",
      <ReviewReference
        reference={starting}
        kind="ligand"
        language={language}
      />,
    ]);
  if (origin)
    rows.push([
      zh ? "骨架来源分子" : "Scaffold source molecule",
      <ReviewReference reference={origin} kind="ligand" language={language} />,
    ]);
  if (fragments.length)
    rows.push([
      zh ? "连接位置" : "Attachment sites",
      zh ? "按图中 * / R 标记的位置设计" : "Design at the marked sites (* / R)",
    ]);
  if (options) {
    rows.push([
      zh ? "候选预算" : "Candidate budget",
      String(payload.candidates),
    ]);
    if (payload.mode === "optimize") {
      rows.push([
        zh ? "优化轮数" : "Optimization steps",
        String(payload.optimization_steps),
      ]);
      rows.push([
        zh ? "性质目标" : "Property objectives",
        `QED · MW ${range(payload.molecular_weight)} g/mol · LogP ${range(payload.logp)}`,
      ]);
    }
    rows.push([
      zh ? "计算资源" : "Resources",
      `${options.device === "cuda" ? "GPU" : "CPU"} · ${options.cpu} ${zh ? "核" : "cores"} · ${options.memory_mib} MiB`,
    ]);
    rows.push([zh ? "随机种子" : "Random seed", String(options.seed)]);
  }
  return (
    <section
      className={
        "molecule-design-review" + (options ? " is-submission-review" : "")
      }
      aria-label={zh ? "分子设计范围" : "Molecular design scope"}
    >
      <StructureWorkbench
        preview={
          fragments.length ? (
            <div className="design-fragment-previews">
              {fragments.map((smiles, index) => (
                <figure key={`${index}:${smiles}`}>
                  <MoleculeImage
                    source={{ smiles }}
                    language={language}
                    label={
                      (zh ? "骨架或片段 " : "Scaffold or fragment ") +
                      (index + 1)
                    }
                  />
                  <figcaption>
                    {zh ? "骨架或片段" : "Scaffold or fragment"} {index + 1} · *
                    / R{zh ? " 连接位置" : " attachment sites"}
                  </figcaption>
                </figure>
              ))}
            </div>
          ) : starting ? (
            <MoleculeImage
              source={{
                url: `/api/assets/${encodeURIComponent(starting.asset_id)}`,
                record: starting.record,
              }}
              language={language}
              label={zh ? "起始分子" : "Starting molecule"}
            />
          ) : null
        }
      >
        <table
          className="compact-table"
          aria-label={zh ? "设计方案核对" : "Design plan review"}
        >
          <tbody>
            {rows.map(([label, value]) => (
              <tr key={label}>
                <th scope="row">{label}</th>
                <td>{value}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="muted">
          {zh
            ? "按化学结构设计，不固定三维坐标；生成后需另行评估结合姿势与性质。"
            : "Chemical-structure design does not fix 3D coordinates. Assess binding poses and properties separately."}
        </p>
      </StructureWorkbench>
    </section>
  );
}
