import { useState } from "react";
import { Hint } from "../guided/Hint";
import {
  residueLabel,
  type SceneInfo,
  type SelectionInfo,
  type ViewerOptions,
} from "./protocol";
import type { Language } from "../types";
export function ViewerControls({
  language,
  scene,
  options,
  selection,
  distance,
  disabled,
  onOptions,
  send,
}: {
  language: Language;
  scene: SceneInfo;
  options: ViewerOptions;
  selection: SelectionInfo | null;
  distance: number | null;
  disabled: boolean;
  onOptions(value: Partial<ViewerOptions>): void;
  send(type: string, value?: unknown): void;
}) {
  const zh = language === "zh",
    [query, setQuery] = useState("");
  const residues = [...scene.ligands, ...scene.residues]
    .filter((r) =>
      residueLabel(r).toLowerCase().includes(query.trim().toLowerCase()),
    )
    .slice(0, 80);
  return (
    <fieldset className="viewer-controls" disabled={disabled}>
      {scene.ligands.length > 0 && (
        <div className="pocket-controls">
          <label>
            {zh ? "中心配体" : "Central ligand"}
            <select
              value={options.ligand}
              onChange={(e) => onOptions({ ligand: e.target.value })}
            >
              {scene.ligands.map((r) => (
                <option value={r.key} key={r.key}>
                  {residueLabel(r)}
                </option>
              ))}
            </select>
          </label>
          <button type="button" onClick={() => send("focus-ligand")}>
            {zh ? "定位配体" : "Focus ligand"}
          </button>
          {scene.hasPolymer && (
            <>
              <label>
                {zh ? "口袋范围" : "Pocket radius"}
                <select
                  value={options.radius}
                  onChange={(e) =>
                    onOptions({
                      radius: Number(e.target.value),
                      mode: "pocket",
                    })
                  }
                >
                  {[3, 4, 5, 6, 8].map((n) => (
                    <option key={n} value={n}>
                      {n} Å{n === 5 ? (zh ? " · 推荐" : " · default") : ""}
                    </option>
                  ))}
                </select>
              </label>
              <Hint label={zh ? "口袋范围说明" : "Pocket radius help"}>
                {zh
                  ? "显示距离所选配体任一原子在此范围内的整个残基。这是几何邻域，不是自动识别出的结合位点。"
                  : "Show complete residues within this distance of any atom in the selected ligand. This is a geometric neighborhood, not an automatically identified binding site."}
              </Hint>
              {!scene.hasInteractionContext && (
                <label className="checkbox-label">
                  <input
                    type="checkbox"
                    checked={options.labels}
                    onChange={(e) => onOptions({ labels: e.target.checked })}
                  />
                  {zh ? "残基名称" : "Residue labels"}
                </label>
              )}
            </>
          )}
        </div>
      )}
      <details className="selection-editor" open>
        <summary>
          {zh ? "点选与显示编辑" : "Selection and display editing"}
        </summary>
        <div className="selection-row">
          <label>
            {zh ? "鼠标点选" : "Mouse selection"}
            <select
              value={options.pick}
              onChange={(e) =>
                onOptions({ pick: e.target.value as ViewerOptions["pick"] })
              }
            >
              <option value="residue">
                {zh ? "整个残基" : "Whole residue"}
              </option>
              <option value="atom">{zh ? "单个原子" : "Single atom"}</option>
              <option value="distance">
                {zh ? "两点测距" : "Measure two atoms"}
              </option>
            </select>
          </label>
          <Hint label={zh ? "选择和编辑说明" : "Selection and editing help"}>
            {zh
              ? "直接点三维图，或从下方列表选择。编辑只改变显示，原始结构和预测输入不变；测距显示几何距离，不判断氢键。"
              : "Click in 3D or use the list below. Edits affect the display only; original coordinates and prediction inputs stay intact. Measurements are geometric distances, not hydrogen-bond assignments."}
          </Hint>
          <button
            type="button"
            onClick={() => send("selection-action", "restore")}
          >
            {zh ? "恢复全部显示" : "Restore display"}
          </button>
        </div>
        {options.pick === "distance" && (
          <p role="status" className="measurement-status">
            {distance == null
              ? zh
                ? "请依次点击两个原子。"
                : "Click two atoms in sequence."
              : (zh ? "两点距离：" : "Distance: ") + distance.toFixed(2) + " Å"}
          </p>
        )}
        <p className="selection-explanation" role="status">
          {selection
            ? `${zh ? "已选中" : "Selected"}：${selection.chain}:${selection.residue} · ${selection.atom} (${selection.element}) · ${selection.count} ${zh ? "个原子" : "atoms"}`
            : zh
              ? "在预览中点选原子或残基，相关操作会在这里启用。"
              : "Select an atom or residue in the preview to enable its actions."}
        </p>
        <div className="selection-actions">
          {(
            [
              ["focus", "定位选中", "Focus selection"],
              ["stick", "棒状", "Sticks"],
              ["line", "细线", "Lines"],
              ["sphere", "空间填充", "Spheres"],
              ["hide", "隐藏选中", "Hide selection"],
              ["clear", "清除选择", "Clear selection"],
            ] as const
          ).map(([action, cn, en]) => (
            <button
              type="button"
              key={action}
              disabled={!selection || disabled}
              onClick={() => send("selection-action", action)}
            >
              {zh ? cn : en}
            </button>
          ))}
        </div>
        {scene.residues.length > 0 && (
          <details className="residue-browser">
            <summary>
              {zh ? "从列表选择残基" : "Select a residue from the list"}
            </summary>
            <input
              aria-label={zh ? "搜索残基" : "Search residues"}
              value={query}
              placeholder={
                zh ? "输入链、残基名或编号" : "Chain, residue name or number"
              }
              onChange={(e) => setQuery(e.target.value)}
            />
            <div className="residue-options">
              {residues.map((r) => (
                <button
                  type="button"
                  key={r.key}
                  onClick={() => send("residue", r.key)}
                >
                  {residueLabel(r)}
                </button>
              ))}
              {!residues.length && (
                <p>{zh ? "没有匹配的残基" : "No matching residues"}</p>
              )}
            </div>
            <p className="small muted">
              {zh
                ? "最多显示 80 项，可输入名称缩小范围。"
                : "Up to 80 matches. Type to narrow the list."}
            </p>
          </details>
        )}
      </details>
    </fieldset>
  );
}
