import { useCallback, useState } from "react";
import { ReferencePicker } from "../diffsbdd/ReferencePicker";
import { StructureViewer } from "../viewer/StructureViewer";
import { Hint } from "../guided/Hint";
import type { SceneInfo } from "../viewer/protocol";
import type { Language } from "../types";
import type { MoleculeRef } from "../research/types";
const amino = new Set(
  "ALA ARG ASN ASP CYS GLN GLU GLY HIS ILE LEU LYS MET PHE PRO SER THR TRP TYR VAL".split(
    " ",
  ),
);
export const referenceUrl = (value: MoleculeRef) =>
  "/api/assets/" + encodeURIComponent(value.asset_id);
export function PartnerStep({
  title,
  source,
  arm,
  chain,
  binary,
  language,
  onSource,
  onArm,
  onChain,
  onValid,
  sameSource,
  onSameSource,
}: {
  title: string;
  source: MoleculeRef | null;
  arm: MoleculeRef | null;
  chain: string;
  binary: boolean;
  language: Language;
  onSource(value: MoleculeRef | null): void;
  onArm(value: MoleculeRef | null): void;
  onChain(value: string): void;
  onValid(value: boolean): void;
  sameSource?: MoleculeRef | null;
  onSameSource?(): void;
}) {
  const zh = language === "zh",
    [chains, setChains] = useState<string[]>([]),
    [eligible, setEligible] = useState<string[]>([]);
  const loaded = useCallback(
    (scene: SceneInfo) => {
      const available = [
        ...new Set(
          scene.residues.filter((r) => amino.has(r.resn)).map((r) => r.chain),
        ),
      ];
      const supported = available.filter((id) => {
        const count = scene.residues.filter(
          (r) => r.chain === id && amino.has(r.resn),
        ).length;
        return /^[A-Za-z0-9]$/.test(id) && count >= 30 && count <= 1800;
      });
      setEligible((previous) =>
        JSON.stringify(previous) === JSON.stringify(supported)
          ? previous
          : supported,
      );
      setChains((previous) =>
        JSON.stringify(previous) === JSON.stringify(available)
          ? previous
          : available,
      );
      const chosen = supported.includes(chain)
        ? chain
        : available.length === 1 && supported.length === 1
          ? supported[0]
          : "";
      if (chosen !== chain) onChain(chosen);
      onValid(Boolean(chosen));
    },
    [chain, onChain, onValid],
  );
  return (
    <div className="proximity-partner-layout">
      <div className="proximity-materials">
        <ReferencePicker
          kind="structure"
          value={source}
          onChange={onSource}
          language={language}
          label={title}
          allowedSuffixes={[".pdb", ".cif"]}
        />
        {sameSource && onSameSource && (
          <button type="button" className="text-button" onClick={onSameSource}>
            {zh
              ? "与上一端使用同一个复合物文件"
              : "Use the previous complex file"}
          </button>
        )}
        {source && (
          <label>
            {zh ? "选择蛋白链" : "Choose the protein chain"}{" "}
            <Hint label={zh ? "如何选择蛋白链？" : "Which chain?"}>
              {zh
                ? "每个伙伴选择一条主要结合链。其他亚基需要在完整装配中另行复核。"
                : "Choose one principal binding chain per partner. Accessory subunits need a separate whole-assembly assessment."}
            </Hint>
            <select
              aria-label={title + (zh ? " · 蛋白链" : " · protein chain")}
              value={chain}
              onChange={(e) => {
                onChain(e.target.value);
                onValid(eligible.includes(e.target.value));
              }}
            >
              <option value="">
                {zh ? "请在预览中选择蛋白链" : "Choose a protein chain"}
              </option>
              {chains.map((value) => (
                <option
                  key={value}
                  value={value}
                  disabled={!eligible.includes(value)}
                >
                  {zh ? "链 " : "Chain "}
                  {value}
                </option>
              ))}
            </select>
          </label>
        )}
        {source && chains.length > 0 && eligible.length === 0 && (
          <p role="status" className="field-note">
            {zh
              ? "请先准备一条完整、可识别的蛋白链，或选择其他结构。"
              : "Prepare a complete recognized protein chain, or choose another structure."}
          </p>
        )}
        {binary && (
          <ReferencePicker
            kind="ligand"
            value={arm}
            onChange={onArm}
            language={language}
            label={
              zh
                ? "与这一端结合的分子片段"
                : "Molecular fragment bound to this partner"
            }
            allowedSuffixes={[".sdf", ".mol"]}
          />
        )}
        {binary && (
          <p className="field-note">
            {zh
              ? "使用已经定位在该蛋白中的三维结合姿势。"
              : "Use the three-dimensional fragment pose already positioned in this protein."}
          </p>
        )}
      </div>
      {source && (
        <StructureViewer
          urls={[
            referenceUrl(source),
            ...(binary && arm ? [referenceUrl(arm)] : []),
          ]}
          records={[source.record, ...(binary && arm ? [arm.record] : [])]}
          language={language}
          molecularSource={
            binary && arm
              ? { url: referenceUrl(arm), record: arm.record }
              : undefined
          }
          onSceneLoaded={loaded}
        />
      )}
    </div>
  );
}
