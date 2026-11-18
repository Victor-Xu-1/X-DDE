import { FollowupBackendControl } from "../utilities/TaskBackendControl";
import { useWorkbenchDrawing } from "./useWorkbenchDrawing";
import { useEffect, useRef, useState } from "react";
import type { Job, Language } from "../types";
import type { ScientificObject } from "../research/types";
import type { Deployment } from "../deployment/client";
import { PropertyForm } from "../operations/PropertyForm";
import "./editors.css";
import { AlignedEditAction } from "./AlignedEditAction";
import { EditorCommands } from "./EditorCommands";
import {
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
  const [frameGeneration, setFrameGeneration] = useState(0);
  const [loadAttempt, setLoadAttempt] = useState(0);
  const [loadFailure, setLoadFailure] = useState<{ sourceId: string } | null>(
    null,
  );
  const [mode, setMode] = useState<"ketcher" | "molstar">("ketcher");
  const [proteinOpened, setProteinOpened] = useState(false);
  const frame = useRef<HTMLIFrameElement>(null);
  const [alignedOpen, setAlignedOpen] = useState(false);
  const [alignedTarget, setAlignedTarget] = useState<HTMLElement | null>(null);
  const [message, setMessage] = useState(""),
    [error, setError] = useState("");
  const [propertyObject, setPropertyObject] = useState<ScientificObject | null>(
      null,
    ),
    [busy, setBusy] = useState(false);
  const saveIntent = useRef(new MoleculeSaveIntent());
  const loadQueue = useRef<Promise<void>>(Promise.resolve());
  const actionRunning = useRef(false);
  const drawing = useWorkbenchDrawing(
    frame,
    frameGeneration,
    mode === "ketcher",
  );
  const openedSource = useRef("");
  const unavailable = busy || drawing.busy || !drawing.ready;
  const contextKey = `${frameGeneration}:${initialObject?.id}:${loadAttempt}`;
  const currentContext = useRef(contextKey);
  currentContext.current = contextKey;

  useEffect(() => {
    if (!initialObject) {
      openedSource.current = "";
      setBusy(false);
      return;
    }
    if (!drawing.ready || openedSource.current === contextKey) return;
    openedSource.current = "";
    const request = contextKey;
    const controller = new AbortController();
    setMode("ketcher");
    setBusy(true);
    setError("");
    setMessage("");
    setLoadFailure(null);
    setOrigin(null);
    const loading = loadQueue.current
      .then(async () => {
        controller.signal.throwIfAborted();
        const record = await molecularRecord(initialObject, controller.signal);
        controller.signal.throwIfAborted();
        await drawing.open(record);
        if (controller.signal.aborted) return;
        openedSource.current = request;
        setOrigin(initialObject);
        setMessage(
          zh
            ? "已打开所选版本；保存将创建新分子版本。"
            : "Selected version opened. Saving creates a new molecule version.",
        );
      })
      .catch((e) => {
        if (!controller.signal.aborted) {
          setError(String(e));
          setLoadFailure({ sourceId: initialObject.id });
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setBusy(false);
      });
    loadQueue.current = loading;
    return () => controller.abort();
  }, [initialObject?.id, drawing.ready, frameGeneration, loadAttempt]);
  async function action(fn: (editor: Ketcher) => Promise<void>) {
    if (actionRunning.current || unavailable) return;
    actionRunning.current = true;
    const failedLoad = loadFailure;
    setError("");
    setMessage("");
    setBusy(true);
    try {
      const editor = drawing.editor();
      await fn(editor);
      setLoadFailure((current) => (current === failedLoad ? null : current));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      actionRunning.current = false;
      setBusy(false);
    }
  }
  async function saveMolecule(editor: Ketcher) {
    const context = currentContext.current;
    if (!(await editor.getSmiles()).trim())
      throw new Error(zh ? "请先画一个分子。" : "Draw a molecule first.");
    const mol = await editor.getMolfile();
    let version: ScientificObject;
    try {
      version = await saveIntent.current.save(mol, origin);
    } catch (error) {
      if (
        error instanceof TypeError ||
        (error instanceof DOMException &&
          ["TimeoutError", "AbortError"].includes(error.name))
      )
        throw new Error(
          zh
            ? "未能确认保存结果。请再次点击保存，系统会继续同一次保存。"
            : "The save result could not be confirmed. Save again to continue the same save.",
        );
      throw error;
    }
    if (currentContext.current !== context) return null;
    setOrigin(version);
    return version;
  }
  function openFile(file: File) {
    void action(async (editor) => {
      if (file.size > 5 * 1024 ** 2) throw new Error("5 MiB maximum");
      try {
        await editor.setMolecule(await file.text());
      } catch (cause) {
        throw new Error(
          zh
            ? "无法打开此分子文件。请检查文件格式，或整理并恢复之前的绘图。"
            : "Unable to open this molecule. Check the file format or prepare and restore the previous drawing.",
          { cause },
        );
      }
      setOrigin(null);
    });
  }
  return (
    <section className="editor-workspace">
      <h1 className="sr-only">
        {zh ? "从一个分子开始" : "Begin with a molecule"}
      </h1>
      <EditorCommands
        language={language}
        mode={mode}
        installed={Boolean(deployment?.installed[mode])}
        unavailable={unavailable}
        available={drawing.available}
        needsPreparation={drawing.needsPreparation}
        propertiesOpen={Boolean(propertyObject)}
        alignedOpen={alignedOpen}
        onMode={(value) => {
          setMode(value);
          if (value === "molstar") setProteinOpened(true);
          setError("");
        }}
        onSetup={onSetup}
        onOpen={openFile}
        onSave={() =>
          void action(async (editor) => {
            if (!(await saveMolecule(editor))) return;
            setMessage(
              zh
                ? "已保存，可在研究文件中继续使用。二维编辑不代表已预测三维姿势。"
                : "Saved. Continue using this molecule in Research files. A 2D edit is not a predicted 3D pose.",
            );
          })
        }
        onProperties={() =>
          void action(async (editor) => {
            const saved = await saveMolecule(editor);
            if (saved) setPropertyObject(saved);
          })
        }
        onPrepare={() => void action(async () => drawing.prepare())}
        alignedAction={
          origin && (
            <AlignedEditAction
              origin={origin}
              language={language}
              busy={
                unavailable || !drawing.available || Boolean(propertyObject)
              }
              execute={action}
              onCreated={onCreated}
              panelTarget={alignedTarget}
              onOpenChange={setAlignedOpen}
            />
          )
        }
      />
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
          {drawing.needsPreparation && mode === "ketcher" && !error && (
            <p className="error" role="alert">
              {drawing.ready
                ? zh
                  ? "请先整理为二维结构；原始结构与撤销记录已保留。"
                  : "Prepare a 2D drawing before using this molecule. The original and Undo history are retained."
                : zh
                  ? "绘图组件未能连接，请重新打开编辑器。"
                  : "The drawing component could not connect. Reopen the editor."}
            </p>
          )}
          {drawing.needsPreparation && !drawing.ready && (
            <button
              onClick={() => frame.current?.contentWindow?.location.reload()}
            >
              {zh ? "重新连接编辑器" : "Reconnect editor"}
            </button>
          )}
          {error && (
            <p className="error" role="alert">
              {error}
            </p>
          )}
          {loadFailure?.sourceId === initialObject?.id && loadFailure && (
            <button
              disabled={busy}
              onClick={() => setLoadAttempt((attempt) => attempt + 1)}
            >
              {zh ? "重试打开" : "Retry opening"}
            </button>
          )}
          {message && (
            <p role="status" className="notice editor-status">
              {message}
            </p>
          )}
        </>
      )}
      <div className="editor-stage" hidden={!deployment?.installed[mode]}>
        <div className="editor-frames">
          {deployment?.installed.ketcher && (
            <iframe
              ref={frame}
              onLoad={() => {
                setFrameGeneration((value) => value + 1);
                setOrigin(null);
                setMessage("");
              }}
              hidden={mode !== "ketcher"}
              inert={!drawing.ready}
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
        </div>
        <aside
          className="editor-details"
          aria-label={zh ? "分子研究操作" : "Molecule research actions"}
          hidden={mode !== "ketcher" || !(alignedOpen || propertyObject)}
        >
          <div className="editor-aligned-target" ref={setAlignedTarget} />
          {propertyObject && (
            <section className="setup-card">
              <div className="section-heading">
                <h2
                  aria-label={
                    zh
                      ? "检查分子并计算性质"
                      : "Review molecule and calculate properties"
                  }
                >
                  {zh ? "分子性质" : "Molecular properties"}
                </h2>
                <button onClick={() => setPropertyObject(null)}>
                  {zh ? "关闭" : "Close"}
                </button>
              </div>
              <FollowupBackendControl
                language={language}
                capability={"properties"}
              />
              <PropertyForm
                key={propertyObject.id}
                initialFile={propertyObject.reference.asset_id}
                scientificInput={propertyObject.reference}
                language={language}
                onCreated={onCreated}
              />
            </section>
          )}
        </aside>
      </div>
    </section>
  );
}
