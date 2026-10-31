import { useState } from "react";
import { StructureWorkbench } from "../presentation/StructureWorkbench";
import { StructureViewer } from "../viewer/StructureViewer";
import {
  emptyScene,
  residueLabel,
  type Residue,
  type SceneInfo,
} from "../viewer/protocol";
import { Hint } from "../guided/Hint";
import type { MoleculeRef } from "../research/types";
import type { Language } from "../types";
import type { FlexibleResidue } from "./types";

const supported = new Set(
  "ARG ASN ASP CYS GLN GLU HIS ILE LEU LYS MET PHE SER THR TRP TYR VAL".split(
    " ",
  ),
);
const identity = (r: FlexibleResidue) =>
  JSON.stringify([r.chain, r.number, r.insertion_code]);
const choice = (r: Residue): FlexibleResidue => ({
  chain: r.chain.trim(),
  number: r.resi,
  insertion_code: r.icode.trim(),
});
const eligible = (r: Residue) =>
  supported.has(r.resn) &&
  /^[A-Za-z0-9]$/.test(r.chain.trim()) &&
  Number.isInteger(r.resi) &&
  r.resi >= -999 &&
  r.resi <= 9999 &&
  /^[A-Za-z0-9]?$/.test(r.icode.trim());

export function FlexibleReceptorSettings({
  receptor,
  ligand,
  language,
  value,
  onChange,
}: {
  receptor: MoleculeRef;
  ligand: MoleculeRef | null;
  language: Language;
  value: FlexibleResidue[] | null;
  onChange(value: FlexibleResidue[] | null): void;
}) {
  const zh = language === "zh",
    [scene, setScene] = useState<SceneInfo>(emptyScene),
    [message, setMessage] = useState("");
  const available = scene.residues.filter(eligible);
  function add(residue: Residue) {
    const item = choice(residue);
    if (!value || value.some((r) => identity(r) === identity(item))) return;
    if (value.length >= 8) {
      setMessage(
        zh ? "最多选择 8 个侧链。" : "Select at most eight sidechains.",
      );
      return;
    }
    setMessage("");
    onChange([...value, item]);
  }
  return (
    <section aria-label={zh ? "受体局部调整" : "Local receptor adjustment"}>
      <label>
        <input
          type="checkbox"
          checked={value !== null}
          onChange={(e) => {
            setMessage("");
            onChange(e.target.checked ? [] : null);
          }}
        />
        {zh ? "允许所选侧链局部调整" : "Allow selected sidechains to adjust"}
      </label>
      <Hint label={zh ? "什么情况下使用？" : "When should I use this?"}>
        {zh
          ? "默认固定蛋白。仅在已有结合姿势需要局部检查时选择 1–8 个侧链；主链与其他原子保持固定。请使用重原子受体，金属附近或二硫键侧链需要专门处理。输出是结构假设，不能证明结合或降解。"
          : "Keep the receptor fixed by default. For a local study of an existing bound pose, choose one to eight sidechains; backbone and other atoms stay fixed. Use a heavy-atom receptor. Metal-adjacent or disulfide sidechains need specialized treatment. The result remains a structural hypothesis, not binding or degradation evidence."}
      </Hint>
      {value !== null && (
        <StructureWorkbench
          preview={
            <StructureViewer
              sourceSnapshot
              urls={[
                "/api/assets/" + receptor.asset_id,
                ...(ligand ? ["/api/assets/" + ligand.asset_id] : []),
              ]}
              records={[receptor.record, ...(ligand ? [ligand.record] : [])]}
              language={language}
              selectionMode="residue"
              onSceneLoaded={setScene}
              residueRegion={value.map((r) => ({
                ...r,
                model: 0,
                alternate_location: "",
              }))}
              onAtomSelected={(selected) => {
                if (!selected?.identity || selected.identity.is_ligand) return;
                const r = selected.identity;
                const matches = available.filter(
                  (item) =>
                    identity(choice(item)) ===
                    identity({
                      chain: r.chain.trim(),
                      number: r.number,
                      insertion_code: r.insertion_code.trim(),
                    }),
                );
                if (matches.length === 1) add(matches[0]);
                else
                  setMessage(
                    zh
                      ? "请从列表选择可调整的完整氨基酸侧链。"
                      : "Choose a supported amino-acid sidechain from the list.",
                  );
              }}
            />
          }
        >
          <label className="field">
            {zh ? "选择需要调整的侧链" : "Sidechains to adjust"}
            <select
              value=""
              onChange={(e) => {
                const r = available.find((r) => r.key === e.target.value);
                if (r) add(r);
              }}
            >
              <option value="">
                {zh
                  ? "从列表添加，或在三维图中点选"
                  : "Add from list or select in 3D"}
              </option>
              {available.map((r) => (
                <option key={r.key} value={r.key}>
                  {residueLabel(r)}
                </option>
              ))}
            </select>
          </label>
          <div
            role="group"
            aria-label={zh ? "已选侧链" : "Selected sidechains"}
          >
            {value.map((r) => (
              <button
                type="button"
                key={identity(r)}
                onClick={() =>
                  onChange(value.filter((v) => identity(v) !== identity(r)))
                }
              >
                {r.chain}:{r.number}
                {r.insertion_code} ×
              </button>
            ))}
            {!value.length && (
              <p role="status">
                {zh ? "请选择至少一个侧链。" : "Select at least one sidechain."}
              </p>
            )}
          </div>
          {message && <p role="status">{message}</p>}
        </StructureWorkbench>
      )}
    </section>
  );
}
