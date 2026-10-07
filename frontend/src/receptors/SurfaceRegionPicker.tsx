import { useState } from "react";
import { StructureViewer } from "../viewer/StructureViewer";
import { Hint } from "../guided/Hint";
import type { Language } from "../types";
import type { MoleculeRef } from "../research/types";
import type { SceneInfo, Residue } from "../viewer/protocol";
import { emptyScene } from "../viewer/protocol";
import { surfaceKey, surfaceLabel, type SurfaceRegion } from "./surface-types";
const regionOf = (r: Residue): SurfaceRegion => ({
  chain: r.chain.trim(),
  number: r.resi,
  insertion_code: r.icode.trim(),
  resname: r.resn,
});
export function SurfaceRegionPicker({
  source,
  language,
  value,
  onChange,
  onChains,
  maximum = 128,
  purpose = "surface",
}: {
  source: MoleculeRef;
  language: Language;
  value: SurfaceRegion[];
  onChange(v: SurfaceRegion[]): void;
  onChains(v: string[]): void;
  maximum?: number;
  purpose?: "surface" | "channel";
}) {
  const zh = language === "zh",
    [scene, setScene] = useState<SceneInfo>(emptyScene),
    [message, setMessage] = useState("");
  const available = [...scene.ligands, ...scene.residues];
  function add(r: SurfaceRegion) {
    if (value.length >= maximum) {
      setMessage(
        zh
          ? `一次最多选择 ${maximum} 个组分。`
          : `Choose at most ${maximum} components.`,
      );
      return;
    }
    setMessage("");
    if (!value.some((v) => surfaceKey(v) === surfaceKey(r)))
      onChange([...value, r]);
  }
  return (
    <div className="surface-region-layout">
      <section className="surface-region-choices">
        <div className="surface-region-toolbar">
          <label className="field">
            {zh ? "选择配体或残基" : "Choose a ligand or residue"}
            <select
              value=""
              onChange={(e) => {
                const r = available.find((r) => r.key === e.target.value);
                if (r) add(regionOf(r));
              }}
            >
              <option value="">
                {zh
                  ? "从列表添加，或在三维图中点选"
                  : "Add from list or select in 3D"}
              </option>
              {available.map((r) => (
                <option key={r.key} value={r.key}>
                  {surfaceLabel(regionOf(r))}
                </option>
              ))}
            </select>
          </label>
          <Hint label={zh ? "怎样选择研究区域？" : "How to select a region?"}>
            {purpose === "channel"
              ? zh
                ? "选择结合配体，或位于口袋内的一小组残基。所选重原子的中心作为路径起点；选定配体默认从障碍中移除，蛋白保留。"
                : "Choose the bound ligand or a small residue group in the pocket. Their heavy-atom center defines the starting point. Selected non-polymer ligands are removed from obstacles by default; protein remains."
              : zh
                ? "选择一整个配体或一组残基。多个组分作为一个共同区域计算，彼此之间的遮挡保留；默认整体文件中的全部链参与遮挡。"
                : "Choose a whole ligand or a group of residues. Selected components form one region; their mutual occlusion remains. All provided chains form the default context."}
          </Hint>
        </div>
        <div
          className="surface-selected"
          role="group"
          aria-label={zh ? "已选研究区域" : "Selected region"}
        >
          {value.map((r) => (
            <button
              type="button"
              key={surfaceKey(r)}
              onClick={() =>
                onChange(value.filter((v) => surfaceKey(v) !== surfaceKey(r)))
              }
              aria-label={(zh ? "移除 " : "Remove ") + surfaceLabel(r)}
            >
              {surfaceLabel(r)} ×
            </button>
          ))}
          {!value.length && (
            <span>{zh ? "尚未选择" : "No region selected"}</span>
          )}
        </div>
        {message && <p role="status">{message}</p>}
      </section>
      <div className="surface-region-preview">
        <StructureViewer
          urls={["/api/assets/" + source.asset_id]}
          language={language}
          selectionMode="residue"
          focusLigand={
            value.length === 1
              ? scene.ligands.find(
                  (r) => surfaceKey(regionOf(r)) === surfaceKey(value[0]),
                )?.key
              : undefined
          }
          onSceneLoaded={(s) => {
            setScene(s);
            onChains(s.chains);
          }}
          onAtomSelected={(s) => {
            if (!s?.identity) return;
            const id = s.identity;
            const candidates = available.filter(
              (r) =>
                r.chain.trim() === id.chain &&
                r.resi === id.number &&
                r.icode.trim() === id.insertion_code,
            );
            if (candidates.length === 1) add(regionOf(candidates[0]));
            else
              setMessage(
                zh
                  ? "此位置包含多个组分，请从列表明确选择。"
                  : "This address has several components; choose explicitly from the list.",
              );
          }}
        />
      </div>
    </div>
  );
}
