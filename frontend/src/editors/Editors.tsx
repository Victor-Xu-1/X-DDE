import { useRef, useState } from "react";
import { api } from "../api";
import type { Job, Language } from "../types";
import type { Deployment } from "../deployment/client";
import { PropertyForm } from "../operations/PropertyForm";
import "./editors.css";

interface Ketcher {
  getSmiles(): Promise<string>;
  getMolfile(): Promise<string>;
  setMolecule(value: string): Promise<void>;
}
export function Editors({
  language,
  deployment,
  deploymentError = "",
  onRetry,
  onSetup,
  onCreated,
}: {
  language: Language;
  deployment: Deployment | null;
  deploymentError?: string;
  onRetry?(): void;
  onSetup(): void;
  onCreated(j: Job): void;
}) {
  const zh = language === "zh";
  const [mode, setMode] = useState<"ketcher" | "molstar">("ketcher");
  const [proteinOpened, setProteinOpened] = useState(false);
  const frame = useRef<HTMLIFrameElement>(null);
  const [message, setMessage] = useState(""),
    [error, setError] = useState("");
  const [smiles, setSmiles] = useState(""),
    [busy, setBusy] = useState(false);
  async function action(fn: (editor: Ketcher) => Promise<void>) {
    setError("");
    setMessage("");
    setBusy(true);
    try {
      const editor = (
        frame.current?.contentWindow as (Window & { ketcher?: Ketcher }) | null
      )?.ketcher;
      if (!editor)
        throw new Error(
          zh
            ? "编辑器正在加载，请稍后再试。"
            : "Editor is loading; try again shortly.",
        );
      await fn(editor);
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="editor-workspace">
      <header className="research-heading">
        <span className="eyebrow">MOLECULAR WORKSPACE</span>
        <h1>{zh ? "从一个分子开始" : "Begin with a molecule"}</h1>
        <p>
          {zh
            ? "画出你的想法，或走进蛋白的三维结构。编辑器在本机运行，输入文件不会上传到第三方编辑网站。"
            : "Sketch an idea or explore a protein in three dimensions. Editors run locally; inputs are not sent to third-party editor websites."}
        </p>
      </header>
      <div
        className="editor-tabs"
        role="group"
        aria-label={zh ? "编辑器选择" : "Choose editor"}
      >
        <button
          aria-pressed={mode === "ketcher"}
          onClick={() => {
            setMode("ketcher");
            setError("");
          }}
        >
          {zh ? "分子绘图" : "Molecule sketch"} · Ketcher
        </button>
        <button
          aria-pressed={mode === "molstar"}
          onClick={() => {
            setMode("molstar");
            setProteinOpened(true);
            setError("");
          }}
        >
          {zh ? "蛋白与复合物" : "Proteins & complexes"} · Mol*
        </button>
        <button onClick={onSetup}>
          {zh ? "管理编辑器" : "Manage editors"}
        </button>
      </div>
      {!deployment ? (
        <div
          className="empty-state"
          role={deploymentError ? "alert" : "status"}
        >
          <h2>
            {deploymentError
              ? zh
                ? "暂时无法读取编辑器状态"
                : "Unable to load editor status"
              : zh
                ? "正在读取编辑器状态…"
                : "Loading editor status…"}
          </h2>
          {deploymentError && (
            <>
              <p>
                {zh
                  ? "请检查工作台连接后重试。"
                  : "Check the workbench connection and try again."}
              </p>
              <button className="secondary-button" onClick={onRetry}>
                {zh ? "重新连接" : "Reconnect"}
              </button>
            </>
          )}
        </div>
      ) : !deployment.installed[mode] ? (
        <div className="editor-empty">
          <span className="step-number">{mode === "ketcher" ? "⌬" : "◇"}</span>
          <h2>{zh ? "安装后即可开始" : "Install to get started"}</h2>
          <p>
            {zh
              ? "只需安装一次，不需要 GPU 或模型权重。"
              : "One-time installation, no GPU or model weights required."}
          </p>
          <button onClick={onSetup}>
            {zh ? "前往安装与组件" : "Go to installation & components"}
          </button>
        </div>
      ) : (
        <>
          {mode === "ketcher" && (
            <div className="editor-toolbar">
              <label className="file-choice">
                {zh ? "打开 MOL / SDF / SMILES" : "Open MOL / SDF / SMILES"}
                <input
                  type="file"
                  accept=".mol,.sdf,.smi,.smiles"
                  disabled={busy}
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file)
                      void action(async (editor) => {
                        if (file.size > 5 * 1024 ** 2)
                          throw new Error("5 MiB maximum");
                        await editor.setMolecule(await file.text());
                      });
                    e.target.value = "";
                  }}
                />
              </label>
              <button
                disabled={busy}
                title={
                  zh
                    ? "保存到工作台的分子文件库，后续任务可以直接选择。"
                    : "Save to the Workbench asset library for subsequent tasks."
                }
                onClick={() =>
                  void action(async (editor) => {
                    if (!(await editor.getSmiles()).trim())
                      throw new Error(
                        zh ? "请先画一个分子。" : "Draw a molecule first.",
                      );
                    const mol = await editor.getMolfile();
                    await api.upload(
                      new File([mol + "\n$$$$\n"], "sketched-molecule.sdf", {
                        type: "chemical/x-mdl-sdfile",
                      }),
                      "ligand",
                    );
                    setMessage(
                      zh
                        ? "已保存到分子文件库，可在任务输入中选择。"
                        : "Saved to the molecule library; select it in task inputs.",
                    );
                  })
                }
              >
                {zh ? "保存到工作台" : "Save to Workbench"}
              </button>
              <button
                disabled={busy}
                onClick={() =>
                  void action(async (editor) => {
                    const value = await editor.getSmiles();
                    if (!value.trim())
                      throw new Error(
                        zh ? "请先画一个分子。" : "Draw a molecule first.",
                      );
                    setSmiles(value);
                  })
                }
              >
                {zh ? "用这个分子计算性质" : "Calculate properties"}
              </button>
            </div>
          )}
          {error && (
            <p className="error" role="alert">
              {error}
            </p>
          )}
          {message && (
            <p role="status" className="notice">
              {message}
            </p>
          )}
          <p className="field-help">
            {mode === "ketcher"
              ? zh
                ? "左侧选择原子或键，直接在画布中绘制；编辑器工具栏支持撤销、清理结构和导出。"
                : "Choose atoms and bonds, then draw on the canvas. Use the editor toolbar to undo, clean and export."
              : zh
                ? "打开本地 PDB / mmCIF 文件；在 Mol* 中选择残基、查看序列、改变表示方式和保存视图。这是结构检查与显示编辑，不会替代蛋白序列设计或能量优化。"
                : "Open local PDB / mmCIF files. Select residues, inspect sequences, change representations and save views. These are inspection and display edits, not protein sequence design or energy optimization."}
          </p>
        </>
      )}
      {deployment?.installed.ketcher && (
        <iframe
          ref={frame}
          hidden={mode !== "ketcher"}
          className="molecular-editor"
          title="Ketcher molecular editor"
          src="/tools/ketcher/index.html"
        />
      )}
      {deployment?.installed.molstar && proteinOpened && (
        <iframe
          hidden={mode !== "molstar"}
          className="molecular-editor"
          title="Molstar protein structure viewer"
          src="/molecular.html"
        />
      )}
      {smiles && (
        <section className="setup-card">
          <div className="section-heading">
            <h2>
              {zh
                ? "检查分子并计算性质"
                : "Review molecule and calculate properties"}
            </h2>
            <button onClick={() => setSmiles("")}>
              {zh ? "关闭" : "Close"}
            </button>
          </div>
          <PropertyForm
            key={smiles}
            initialSmiles={smiles}
            language={language}
            onCreated={onCreated}
          />
        </section>
      )}
    </section>
  );
}
