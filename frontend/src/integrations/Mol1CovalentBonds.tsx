import { useState } from "react";
import type { Component, Language } from "../types";
import type { BondAtom, CovalentBond } from "../operations/types";
import { StructureViewer } from "../viewer/StructureViewer";
import { StructureWorkbench } from "../presentation/StructureWorkbench";

const emptyAtom = (): BondAtom => ({
  entity: 1,
  copy_index: 1,
  position: 1,
  atom: "",
});
const label = (atom: BondAtom) =>
  `${atom.entity}:${atom.copy_index ?? "*"}:${atom.position} · ${atom.atom}`;
export function Mol1CovalentBonds({
  components,
  value,
  onChange,
  language,
}: {
  components: Component[];
  value: CovalentBond[];
  onChange(value: CovalentBond[]): void;
  language: Language;
}) {
  const zh = language === "zh";
  const [left, setLeft] = useState(emptyAtom),
    [right, setRight] = useState(emptyAtom);
  const [side, setSide] = useState<"left" | "right">("left");
  const current = side === "left" ? left : right;
  const setCurrent = side === "left" ? setLeft : setRight;
  const component = components[current.entity - 1];
  const valid =
    left.atom.trim() && right.atom.trim() && label(left) !== label(right);
  const fields = (
    <>
      <p className="field-help">
        {zh
          ? "仅在已知化学连接时添加。共价键定义分子连接，不是距离约束，也不代表发生了反应。"
          : "Add only known chemical connections. Covalent bonds define connectivity; they are not distance restraints or evidence that a reaction occurs."}
      </p>
      <label className="field">
        {zh ? "正在选择" : "Selecting endpoint"}
        <select
          value={side}
          onChange={(e) => setSide(e.target.value as typeof side)}
        >
          <option value="left">{zh ? "原子 1" : "Atom 1"}</option>
          <option value="right">{zh ? "原子 2" : "Atom 2"}</option>
        </select>
      </label>
      <label className="field">
        {zh ? "分子组分" : "Molecular component"}
        <select
          value={current.entity}
          onChange={(e) =>
            setCurrent({ ...emptyAtom(), entity: Number(e.target.value) })
          }
        >
          {components.map((item, index) => (
            <option key={index} value={index + 1}>
              {index + 1} · {item.chain_ids?.join(",") || item.kind}
            </option>
          ))}
        </select>
      </label>
      <label className="field">
        {zh ? "拷贝" : "Copy"}
        <input
          type="number"
          min={1}
          max={component?.count ?? 1}
          value={current.copy_index ?? 1}
          onChange={(e) =>
            setCurrent({ ...current, copy_index: Number(e.target.value) })
          }
        />
      </label>
      <label className="field">
        {zh
          ? "残基位置（从 1 开始；单体配体为 1）"
          : "Residue position (1-based; 1 for a single ligand)"}
        <input
          type="number"
          min={1}
          max={
            component && ["protein", "dna", "rna"].includes(component.kind)
              ? component.value.length
              : 5000
          }
          value={current.position}
          onChange={(e) =>
            setCurrent({ ...current, position: Number(e.target.value) })
          }
        />
      </label>
      <label className="field">
        {zh
          ? "原子名称或配体原始索引（从 0 开始）"
          : "Atom name or original ligand index (0-based)"}
        <input
          value={current.atom}
          onChange={(e) =>
            setCurrent({ ...current, atom: e.target.value.trim() })
          }
          placeholder={component?.kind === "ligand" ? "0" : "SG"}
        />
      </label>
      <p>
        {label(left)} ↔ {label(right)}
      </p>
      <button
        type="button"
        disabled={!valid || value.length >= 100}
        onClick={() => {
          const key = [label(left), label(right)].sort().join("|");
          if (
            !value.some(
              (row) =>
                [label(row.left), label(row.right)].sort().join("|") === key,
            )
          )
            onChange([...value, { left, right }]);
          setLeft(emptyAtom());
          setRight(emptyAtom());
        }}
      >
        {zh ? "添加共价连接" : "Add covalent connection"}
      </button>
      <table>
        <caption>
          {zh ? "本次连接" : "Connections in this task"} · {value.length}
        </caption>
        <tbody>
          {value.map((bond, index) => (
            <tr key={index}>
              <td>
                {label(bond.left)} ↔ {label(bond.right)}
              </td>
              <td>
                <button
                  type="button"
                  aria-label={`${zh ? "删除共价连接" : "Remove covalent connection"} ${index + 1}`}
                  onClick={() => onChange(value.filter((_, i) => i !== index))}
                >
                  ×
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </>
  );
  return component?.kind === "ligand" && component.ligand_file ? (
    <StructureWorkbench
      preview={
        <StructureViewer
          sourceSnapshot
          language={language}
          urls={[`/api/assets/${encodeURIComponent(component.ligand_file)}`]}
          selectionMode="atom"
          onAtomSelected={(selection) => {
            if (
              selection?.pick_mode !== "distance" &&
              Number.isInteger(selection?.source_atom_index) &&
              selection!.count === 1
            )
              setCurrent({
                ...current,
                position: 1,
                atom: String(selection!.source_atom_index),
              });
          }}
        />
      }
    >
      {fields}
    </StructureWorkbench>
  ) : (
    fields
  );
}
