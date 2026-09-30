import { useEffect, useRef, useState } from "react";
import type { Job, Language } from "../types";
import type { ScientificObject } from "../research/types";
import type { Deployment } from "../deployment/client";
import { PropertyForm } from "../operations/PropertyForm";
import "./editors.css";
import { AlignedEditAction } from "./AlignedEditAction";
import {
  editorReady,
  molecularRecord,
  MoleculeSaveIntent,
  type Ketcher,
} from "./scientificEditor";
export function Editors({
  language,
  deployment,
  deploymentError = "",
  onRetry,
  onSetup,
  onCreated,
  initialObject = null,
}: {
  language: Language;
  deployment: Deployment | null;
  deploymentError?: string;
  onRetry?(): void;
  onSetup(): void;
  onCreated(j: Job): void;
  initialObject?: ScientificObject | null;
}) {
  const zh = language === "zh";
  const [origin, setOrigin] = useState<ScientificObject | null>(initialObject);
  const [loaded, setLoaded] = useState(false);
  const [mode, setMode] = useState<"ketcher" | "molstar">("ketcher");
  const [proteinOpened, setProteinOpened] = useState(false);
  const frame = useRef<HTMLIFrameElement>(null);
  const [message, setMessage] = useState(""),
    [error, setError] = useState("");
  const [propertyObject, setPropertyObject] = useState<ScientificObject | null>(
      null,
    ),
    [busy, setBusy] = useState(false);
  const saveIntent = useRef(new MoleculeSaveIntent());
  const loadQueue = useRef<Promise<void>>(Promise.resolve());
  const actionRunning = useRef(false);
  useEffect(() => {
    if (!initialObject || !loaded) return;
    const controller = new AbortController();
    setMode("ketcher");
    setBusy(true);
    setError("");
    setOrigin(null);
    const loading = loadQueue.current
      .then(async () => {
        controller.signal.throwIfAborted();
        const record = await molecularRecord(initialObject, controller.signal);
        const editor = await editorReady(frame.current, controller.signal);
        controller.signal.throwIfAborted();
        await editor.setMolecule(record);
        if (controller.signal.aborted) return;
        setOrigin(initialObject);
        setMessage(
          zh
            ? "已打开所选版本；保存将创建新分子版本。"
            : "Selected version opened. Saving creates a new molecule version.",
        );
      })
      .catch((e) => {
        if (!controller.signal.aborted) setError(String(e));
      })
      .finally(() => {
        if (!controller.signal.aborted) setBusy(false);
      });
    loadQueue.current = loading;
    return () => controller.abort();
  }, [initialObject?.id, loaded]);
  async function action(fn: (editor: Ketcher) => Promise<void>) {
    if (actionRunning.current || busy) return;
    actionRunning.current = true;
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
      actionRunning.current = false;
      setBusy(false);
    }
  }
  async function saveMolecule(editor: Ketcher) {
    if (!(await editor.getSmiles()).trim())
      throw new Error(zh ? "请先画一个分子。" : "Draw a molecule first.");
    const version = await saveIntent.current.save(
      await editor.getMolfile(),
      origin,
    );
    setOrigin(version);
    return version;
  }
  return (
    <section className="editor-workspace">
      <header className="research-heading">
        <h1 className="sr-only">
          {zh ? "从一个分子开始" : "Begin with a molecule"}
        </h1>
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
                        setOrigin(null);
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
                    await saveMolecule(editor);
                    setMessage(
                      zh
                        ? "已保存新版本，可在研究资产中查看来源和继续复用。二维编辑不代表已预测三维姿势。"
                        : "New version saved. Inspect its lineage and reuse it in Research assets. A 2D edit is not a predicted 3D pose.",
                    );
                  })
                }
              >
                {zh ? "保存到工作台" : "Save to Workbench"}
              </button>
              <AlignedEditAction
                origin={origin}
                language={language}
                busy={busy}
                execute={action}
                onCreated={onCreated}
              />
              <button
                disabled={busy}
                onClick={() =>
                  void action(async (editor) => {
                    setPropertyObject(await saveMolecule(editor));
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
          onLoad={() => setLoaded(true)}
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
      {propertyObject && (
        <section className="setup-card">
          <div className="section-heading">
            <h2>
              {zh
                ? "检查分子并计算性质"
                : "Review molecule and calculate properties"}
            </h2>
            <button onClick={() => setPropertyObject(null)}>
              {zh ? "关闭" : "Close"}
            </button>
          </div>
          <PropertyForm
            key={propertyObject.id}
            initialFile={propertyObject.reference.asset_id}
            scientificInput={propertyObject.reference}
            language={language}
            onCreated={onCreated}
          />
        </section>
      )}
    </section>
  );
}
