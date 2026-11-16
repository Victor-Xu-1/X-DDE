import { QuestionCircleOutlined, SettingOutlined } from "@ant-design/icons";
import type { ReactNode } from "react";
import type { Language } from "../types";
import { FileSelect } from "../presentation/FileSelect";

/** Compact presentation only; the workbench retains action and molecular state. */
export function EditorCommands({
  language,
  mode,
  installed,
  unavailable,
  available,
  needsPreparation,
  propertiesOpen,
  alignedOpen,
  alignedAction,
  onMode,
  onSetup,
  onOpen,
  onSave,
  onProperties,
  onPrepare,
}: {
  language: Language;
  mode: "ketcher" | "molstar";
  installed: boolean;
  unavailable: boolean;
  available: boolean;
  needsPreparation: boolean;
  propertiesOpen: boolean;
  alignedOpen: boolean;
  alignedAction: ReactNode;
  onMode(value: "ketcher" | "molstar"): void;
  onSetup(): void;
  onOpen(file: File): void;
  onSave(): void;
  onProperties(): void;
  onPrepare(): void;
}) {
  const zh = language === "zh";
  return (
    <div
      className="editor-command-bar"
      role="toolbar"
      aria-label={zh ? "结构编辑操作" : "Structure editor actions"}
    >
      <div
        className="editor-tabs"
        role="group"
        aria-label={zh ? "编辑器选择" : "Choose editor"}
      >
        <button
          aria-label={zh ? "分子绘图 · Ketcher" : "Molecule sketch · Ketcher"}
          title="Ketcher"
          aria-pressed={mode === "ketcher"}
          onClick={() => onMode("ketcher")}
        >
          {zh ? "二维绘图" : "2D drawing"}
        </button>
        <button
          aria-label={
            zh ? "蛋白与复合物 · Mol*" : "Proteins & complexes · Mol*"
          }
          title="Mol*"
          aria-pressed={mode === "molstar"}
          onClick={() => onMode("molstar")}
        >
          {zh ? "三维结构" : "3D structures"}
        </button>
      </div>
      {mode === "ketcher" && installed && (
        <div className="editor-toolbar">
          <FileSelect
            language={language}
            variant="compact"
            title={zh ? "打开" : "Open"}
            aria-label={
              zh ? "打开 MOL / SDF / SMILES" : "Open MOL / SDF / SMILES"
            }
            accept=".mol,.sdf,.smi,.smiles"
            disabled={unavailable}
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) onOpen(file);
              event.target.value = "";
            }}
          />
          <button
            aria-label={zh ? "保存到工作台" : "Save to Workbench"}
            disabled={unavailable || !available}
            onClick={onSave}
            title={
              zh
                ? "保存为工作台的新分子版本。"
                : "Save as a molecule version in the Workbench."
            }
          >
            {zh ? "保存" : "Save"}
          </button>
          {alignedAction}
          <button
            aria-label={zh ? "用这个分子计算性质" : "Calculate properties"}
            disabled={
              unavailable || !available || alignedOpen || propertiesOpen
            }
            onClick={onProperties}
          >
            {zh ? "性质" : "Properties"}
          </button>
          {needsPreparation && (
            <button disabled={unavailable} onClick={onPrepare}>
              {zh ? "整理为二维结构" : "Prepare 2D drawing"}
            </button>
          )}
        </div>
      )}
      <div className="editor-command-tools">
        <details className="editor-help">
          <summary
            aria-label={zh ? "编辑帮助" : "Editor help"}
            title={zh ? "编辑帮助" : "Editor help"}
          >
            <QuestionCircleOutlined />
          </summary>
          <p>
            {mode === "ketcher"
              ? zh
                ? "绘制或打开分子，检查后保存。二维绘图不代表已计算的三维姿势；已有分子的三维编辑使用对齐任务。"
                : "Draw or open a molecule, review it, then save. A 2D drawing is not a calculated 3D pose; use an aligned edit task for an existing molecule."
              : zh
                ? "打开已有 PDB / mmCIF 结构，检查残基、序列和显示方式。显示编辑不会进行序列设计或能量优化。"
                : "Open an existing PDB / mmCIF structure to inspect residues, sequences and representations. Display edits do not perform sequence design or energy optimization."}
          </p>
        </details>
        <button
          onClick={onSetup}
          aria-label={zh ? "管理编辑器" : "Manage editors"}
          title={zh ? "管理编辑器" : "Manage editors"}
        >
          <SettingOutlined />
        </button>
      </div>
    </div>
  );
}
