import { useState } from "react";
import { StructureWorkbench } from "../presentation/StructureWorkbench";
import { StructureViewer } from "../viewer/StructureViewer";
import type { MoleculeRef } from "../research/types";
import type { Language } from "../types";
import {
  atomKey,
  atomLabel,
  pickedAtom,
  restraintKey,
  type RestraintAtom,
  type SimulationRestraint,
} from "./restraints";

export function RestraintEditor({
  structure,
  ligand = null,
  value,
  onChange,
  language,
}: {
  structure: MoleculeRef;
  ligand?: MoleculeRef | null;
  value: SimulationRestraint[];
  onChange(value: SimulationRestraint[]): void;
  language: Language;
}) {
  const zh = language === "zh";
  const [role, setRole] = useState<RestraintAtom["role"]>("structure");
  const [kind, setKind] = useState<"position" | "distance">("position");
  const [selected, setSelected] = useState<RestraintAtom[]>([]);
  const [distance, setDistance] = useState(3);
  const [force, setForce] = useState(1000);
  const [error, setError] = useState("");
  const source = role === "ligand" && ligand ? ligand : structure;
  const ready =
    selected.length === (kind === "position" ? 1 : 2) &&
    Number.isFinite(force) &&
    force > 0 &&
    force <= 100000 &&
    (kind === "position" ||
      (Number.isFinite(distance) && distance > 0.5 && distance <= 100));
  function add() {
    if (!ready || value.length >= 64) return;
    const condition: SimulationRestraint =
      kind === "position"
        ? { kind, atom: selected[0], force_kj_mol_nm2: force }
        : {
            kind,
            first: selected[0],
            second: selected[1],
            distance_angstrom: distance,
            force_kj_mol_nm2: force,
          };
    if (value.some((row) => restraintKey(row) === restraintKey(condition))) {
      setError(
        zh
          ? "这个原子或原子对已有约束，请先删除旧约束。"
          : "This atom or pair already has a restraint. Remove the existing one first.",
      );
      return;
    }
    onChange([...value, condition]);
    setSelected([]);
    setError("");
  }
  return (
    <StructureWorkbench
      preview={
        <StructureViewer
          key={role + source.asset_id + source.sha256}
          sourceSnapshot
          language={language}
          urls={[`/api/assets/${encodeURIComponent(source.asset_id)}`]}
          records={[source.record]}
          selectionMode="atom"
          highlightedAtoms={selected
            .filter((atom) => atom.role === role)
            .flatMap((atom) => (atom.index === null ? [] : [atom.index]))}
          onAtomSelected={(selection) => {
            const atom = pickedAtom(selection, role, source);
            if (!atom) {
              setError(
                zh
                  ? "请选择原始结构中的单个重原子（主构象）。"
                  : "Select one heavy atom in the original structure's primary conformation.",
              );
              return;
            }
            setError("");
            const next =
              kind === "position"
                ? [atom]
                : selected.length === 2
                  ? [atom]
                  : [
                      ...selected.filter(
                        (item) => atomKey(item) !== atomKey(atom),
                      ),
                      atom,
                    ];
            setSelected(next);
            if (next.length === 2)
              setDistance(
                Math.round(
                  Math.hypot(
                    ...next[0].position_angstrom.map(
                      (v, i) => v - next[1].position_angstrom[i],
                    ),
                  ) * 1000,
                ) / 1000,
              );
          }}
        />
      }
    >
      <label className="field">
        {zh ? "选择原子所在材料" : "Choose atoms from"}
        <select
          value={role}
          onChange={(event) => {
            setRole(event.target.value as RestraintAtom["role"]);
            setError("");
          }}
        >
          <option value="structure">
            {zh ? "蛋白结构" : "Protein structure"}
          </option>
          {ligand && (
            <option value="ligand">{zh ? "结合配体" : "Bound ligand"}</option>
          )}
        </select>
      </label>
      <label className="field">
        {zh ? "希望保持什么？" : "What should be maintained?"}
        <select
          value={kind}
          onChange={(event) => {
            setKind(event.target.value as typeof kind);
            setSelected([]);
            setError("");
          }}
        >
          <option value="position">
            {zh ? "原子的初始位置" : "An atom's initial position"}
          </option>
          <option value="distance">
            {zh ? "两个原子的距离" : "Distance between two atoms"}
          </option>
        </select>
      </label>
      <p>
        {selected.map(atomLabel).join(" ↔ ") ||
          (zh
            ? "在左侧结构上点击重原子"
            : "Click heavy atoms in the structure on the left")}
      </p>
      {kind === "distance" && (
        <label className="field">
          {zh ? "目标距离（Å）" : "Target distance (Å)"}
          <input
            type="number"
            step="0.1"
            min="0.6"
            max="100"
            value={distance}
            onChange={(event) => setDistance(Number(event.target.value))}
          />
        </label>
      )}
      <label className="field">
        {zh ? "保持程度" : "Restraint strength"}
        <select
          value={force}
          onChange={(event) => setForce(Number(event.target.value))}
        >
          <option value={100}>{zh ? "轻柔" : "Gentle"}</option>
          <option value={1000}>
            {zh ? "适中 · 推荐" : "Moderate · recommended"}
          </option>
          <option value={10000}>{zh ? "较强" : "Strong"}</option>
        </select>
      </label>
      <p className="field-help">
        {zh
          ? "谐和约束允许偏离，会改变采样分布；不是绝对固定，也不代表结合力。"
          : "Harmonic restraints allow movement and change the sampled distribution; they are not rigid fixes or measures of binding strength."}
      </p>
      <details>
        <summary>{zh ? "物理参数" : "Physical parameter"}</summary>
        <p>{force} kJ mol⁻¹ nm⁻²</p>
      </details>
      <button
        type="button"
        onClick={add}
        disabled={!ready || value.length >= 64}
      >
        {zh ? "添加到任务" : "Add to task"}
      </button>
      <button
        type="button"
        onClick={() => {
          setSelected([]);
          setError("");
        }}
      >
        {zh ? "重新选择" : "Clear selection"}
      </button>
      {error && <p role="alert">{error}</p>}
      <div className="simulation-restraint-list">
        <table>
          <caption>
            {zh ? "本次任务约束" : "Restraints for this task"} · {value.length}
          </caption>
          <thead>
            <tr>
              <th>{zh ? "原子" : "Atoms"}</th>
              <th>{zh ? "目标" : "Target"}</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {value.map((row, index) => (
              <tr key={restraintKey(row)}>
                <td>
                  {row.kind === "position"
                    ? atomLabel(row.atom)
                    : `${atomLabel(row.first)} ↔ ${atomLabel(row.second)}`}
                </td>
                <td>
                  {row.kind === "position"
                    ? zh
                      ? "初始位置"
                      : "Initial position"
                    : `${row.distance_angstrom} Å`}
                </td>
                <td>
                  <button
                    type="button"
                    aria-label={`${zh ? "删除约束" : "Remove restraint"} ${index + 1}`}
                    onClick={() =>
                      onChange(value.filter((_, i) => index !== i))
                    }
                  >
                    ×
                  </button>
                </td>
              </tr>
            ))}
            {!value.length && (
              <tr>
                <td colSpan={3}>
                  {zh
                    ? "未添加自定义约束"
                    : "No user restraints; simulate without these conditions"}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </StructureWorkbench>
  );
}
