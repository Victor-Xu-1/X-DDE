import { useState } from "react";
import type { Language } from "../types";
import type { MoleculeRef } from "../research/types";
import type { Pocket } from "./types";
import { ReferencePicker } from "./ReferencePicker";
import { parseResidues, residueFromSelection } from "./model";
import { StructureViewer } from "../viewer/StructureViewer";
import { Hint } from "../guided/Hint";

export function PocketPicker({
  protein,
  value,
  onChange,
  language,
}: {
  protein: MoleculeRef;
  value: Pocket | null;
  onChange(v: Pocket | null): void;
  language: Language;
}) {
  const zh = language === "zh",
    [kind, setKind] = useState<Pocket["kind"]>("residues");
  const [text, setText] = useState(""),
    [error, setError] = useState("");
  function update(raw: string) {
    setText(raw);
    if (!raw.trim()) {
      onChange(null);
      setError("");
      return;
    }
    try {
      onChange({ kind: "residues", residues: parseResidues(raw, protein) });
      setError("");
    } catch (e) {
      onChange(null);
      setError(String(e));
    }
  }
  return (
    <section>
      <label className="field">
        {zh ? "如何指定口袋？" : "How should the pocket be defined?"}
        <select
          value={kind}
          onChange={(e) => {
            setKind(e.target.value as Pocket["kind"]);
            setText("");
            setError("");
            onChange(null);
          }}
        >
          <option value="residues">
            {zh ? "点击受体残基" : "Click receptor residues"}
          </option>
          <option value="bound_ligand">
            {zh
              ? "点击结构中的共晶配体"
              : "Click a bound ligand in the structure"}
          </option>
          <option value="ligand">
            {zh ? "使用已对齐的参考配体" : "Use an aligned reference ligand"}
          </option>
        </select>
      </label>
      <Hint label={zh ? "口袋选择说明" : "Pocket selection help"}>
        {zh
          ? "点击只是确定输入区域，不代表自动发现口袋或确认配体活性。参考配体必须与受体使用相同坐标。"
          : "Clicks specify an input region; they do not discover pockets or establish activity. Reference ligands must share receptor coordinates."}
      </Hint>
      {kind === "ligand" ? (
        <ReferencePicker
          kind="ligand"
          value={value?.kind === "ligand" ? value.ligand : null}
          onChange={(ligand) =>
            onChange(ligand ? { kind: "ligand", ligand } : null)
          }
          language={language}
          label={zh ? "参考配体" : "Reference ligand"}
        />
      ) : (
        <>
          <StructureViewer
            urls={[`/api/assets/${protein.asset_id}`]}
            language={language}
            onAtomSelected={(s) => {
              if (!s || !s.identity) return;
              const r = s.identity;
              if (r.insertion_code || r.alternate_location) {
                setError(
                  zh
                    ? "请先处理插入编号或替代构象。"
                    : "Resolve insertion codes or alternate locations first.",
                );
                return;
              }
              try {
                if (kind === "bound_ligand" && !r.is_ligand)
                  throw new Error(
                    zh
                      ? "请选择结构中的配体，不要选择蛋白残基。"
                      : "Select a bound ligand, rather than a protein residue.",
                  );
                const ref = residueFromSelection(protein, r.chain, r.number);
                if (kind === "bound_ligand") onChange({ kind, residue: ref });
                else {
                  const token = `${ref.chain}:${ref.number}`,
                    tokens = text.split(/[\s,，]+/).filter(Boolean);
                  update(
                    tokens.includes(token)
                      ? tokens.filter((v) => v !== token).join(", ")
                      : [...tokens, token].join(", "),
                  );
                }
              } catch (e) {
                setError(String(e));
              }
            }}
          />
          {kind === "residues" && (
            <label className="field">
              {zh
                ? "已选残基（也可输入 A:10, A:11）"
                : "Selected residues (or enter A:10, A:11)"}
              <input
                value={text}
                maxLength={3000}
                onChange={(e) => update(e.target.value)}
              />
            </label>
          )}
          {kind === "bound_ligand" && (
            <p>
              {value?.kind === "bound_ligand"
                ? `${value.residue.chain}:${value.residue.number}`
                : zh
                  ? "点击结构中的配体原子。"
                  : "Click an atom of the bound ligand."}
            </p>
          )}
        </>
      )}
      {error && (
        <p role="alert" className="error-box">
          {error}
        </p>
      )}
    </section>
  );
}
