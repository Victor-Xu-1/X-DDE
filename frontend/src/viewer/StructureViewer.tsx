import { version as productVersion } from "../../package.json";
import { useEffect, useRef, useState } from "react";
import {
  FullscreenOutlined,
  LoadingOutlined,
  MinusOutlined,
  PlusOutlined,
  ReloadOutlined,
} from "@ant-design/icons";
import { Hint } from "../guided/Hint";
import { ViewerControls } from "./ViewerControls";
import { InteractionControls } from "./InteractionControls";
import { PoseScore, type NativePoseScore } from "./PoseScore";
import {
  defaultOptions,
  emptyScene,
  type SceneInfo,
  type SelectionInfo,
  type ViewerOptions,
  type PickMode,
  type ContactSummary,
} from "./protocol";
import type { Language } from "../types";
import type { DisplayResidue } from "./residue-region";
import { researchError } from "../presentation/research-content";
import "./viewer.css";
interface Props {
  urls: string[];
  language: Language;
  focusResidue?: { residue: string; nonce: number } | null;
  comparison?: boolean;
  focusModel?: number;
  records?: number[];
  residueRegion?: DisplayResidue[];
  selectionMode?: PickMode;
  highlightedAtoms?: number[];
  nativeScore?: NativePoseScore | null;
  onAtomSelected?(selection: SelectionInfo | null): void;
  onSceneLoaded?(scene: SceneInfo): void;
}
export function StructureViewer({
  urls,
  language,
  focusResidue,
  comparison = false,
  focusModel,
  records,
  residueRegion,
  selectionMode,
  highlightedAtoms,
  nativeScore,
  onAtomSelected,
  onSceneLoaded,
}: Props) {
  const frame = useRef<HTMLIFrameElement>(null),
    zh = language === "zh",
    key = urls.join("|") + ":" + (records?.join(",") ?? "");
  const overlay = urls.length > 1;
  const focusedModel = useRef(focusModel);
  focusedModel.current = focusModel;
  const initialPick = useRef(selectionMode);
  initialPick.current = selectionMode;
  const selectionCallback = useRef(onAtomSelected);
  selectionCallback.current = onAtomSelected;
  const sceneCallback = useRef(onSceneLoaded);
  sceneCallback.current = onSceneLoaded;
  const [ready, setReady] = useState(false),
    [status, setStatus] = useState("empty"),
    [error, setError] = useState("");
  const [scene, setScene] = useState<SceneInfo>(emptyScene),
    [options, setOptions] = useState<ViewerOptions>(defaultOptions);
  const [selection, setSelection] = useState<SelectionInfo | null>(null),
    [distance, setDistance] = useState<number | null>(null);
  const [contacts, setContacts] = useState<ContactSummary | null>(null);
  const [siteStatus, setSiteStatus] = useState<{
    requested: number;
    matched: number;
  } | null>(null);
  function send(type: string, value?: unknown) {
    frame.current?.contentWindow?.postMessage(
      { channel: "opendde-viewer", type, value },
      location.origin,
    );
  }
  useEffect(() => {
    function message(event: MessageEvent) {
      if (
        event.origin !== location.origin ||
        event.source !== frame.current?.contentWindow ||
        event.data?.channel !== "opendde-viewer"
      )
        return;
      const { type, detail } = event.data;
      if (type === "ready") setReady(true);
      if (type === "selected") {
        setSelection(detail);
        selectionCallback.current?.(detail);
      }
      if (type === "contacts") setContacts(detail);
      if (type === "site-region") setSiteStatus(detail);
      if (type === "distance")
        setDistance(
          typeof detail === "number" && Number.isFinite(detail) ? detail : null,
        );
      if (type === "error") {
        setStatus("error");
        setError(String(detail));
      }
      if (type === "loading") setStatus("loading");
      if (type === "loaded") {
        setStatus("loaded");
        setScene(detail);
        sceneCallback.current?.(detail);
        if (focusedModel.current !== undefined)
          send("focus-model", focusedModel.current);
        if (initialPick.current) {
          setOptions({ ...detail.options, pick: initialPick.current });
          send("options", { pick: initialPick.current });
        } else setOptions(detail.options);
      }
    }
    window.addEventListener("message", message);
    return () => window.removeEventListener("message", message);
  }, []);
  useEffect(() => {
    setSelection(null);
    setDistance(null);
    setContacts(null);
    setSiteStatus(null);
    setError("");
    setScene(emptyScene);
    setOptions(defaultOptions);
    if (ready && urls.length) {
      send("load", { urls, comparison, focusModel, records });
      setStatus("loading");
    } else if (!urls.length) {
      if (ready) send("clear");
      setStatus("empty");
    }
  }, [ready, key, comparison, focusModel]);
  useEffect(() => {
    if (ready && focusResidue) send("residue", focusResidue.residue);
  }, [ready, focusResidue]);
  const regionKey = highlightedAtoms?.join(",") ?? "";
  const siteKey = JSON.stringify(residueRegion ?? []);
  useEffect(() => {
    if (ready && status === "loaded" && residueRegion !== undefined)
      send("site-region", residueRegion);
  }, [ready, status, key, siteKey]);
  useEffect(() => {
    if (ready && status === "loaded")
      send("atom-region", highlightedAtoms ?? []);
  }, [ready, status, key, regionKey]);
  function configure(value: Partial<ViewerOptions>) {
    setOptions((o) => ({ ...o, ...value }));
    send("options", value);
  }
  const loaded = status === "loaded";
  return (
    <section className="studio-panel viewer-panel">
      <div className="studio-heading">
        <h3>
          {scene.hasPolymer
            ? zh
              ? "三维结构"
              : "3D structure"
            : zh
              ? "分子三维预览"
              : "3D molecule"}
          <Hint label={zh ? "三维预览说明" : "3D preview help"}>
            {zh
              ? "拖动旋转，滚轮缩放。绿色细棒突出配体；色带显示大分子骨架。点选原子或残基后，可在下方调整显示。"
              : "Drag to rotate and scroll to zoom. Thin green sticks highlight ligands; ribbons show polymer backbones. Select atoms or residues to adjust their display below."}
          </Hint>
        </h3>
        <button
          type="button"
          title={zh ? "全屏" : "Fullscreen"}
          onClick={() =>
            void frame.current
              ?.closest("section")
              ?.requestFullscreen()
              .catch(() =>
                setError(zh ? "浏览器未允许全屏" : "Fullscreen unavailable"),
              )
          }
        >
          <FullscreenOutlined />
        </button>
      </div>
      {scene.hasPolymer && !overlay && (
        <div className="segmented viewer-modes">
          {(
            [
              ["cartoon", "整体骨架", "Backbone"],
              ["pocket", "配体与口袋", "Ligand and pocket"],
              ["surface", "分子表面", "Surface"],
            ] as const
          )
            .filter(([id]) => id !== "pocket" || scene.ligands.length > 0)
            .map(([id, cn, en]) => (
              <button
                type="button"
                key={id}
                className={options.mode === id ? "selected" : ""}
                disabled={!loaded || comparison}
                onClick={() => configure({ mode: id })}
              >
                {zh ? cn : en}
              </button>
            ))}
        </div>
      )}
      {comparison && (
        <p className="viewer-comparison">
          {zh
            ? "蓝 / 橙 / 紫表示不同构象。退出叠加后可编辑单个结构的显示。"
            : "Blue / orange / purple identify conformers. Leave overlay to edit an individual structure's display."}
        </p>
      )}
      <div className="molecular-stage">
        <iframe
          ref={frame}
          src={`/viewer.html?v=${encodeURIComponent(productVersion)}`}
          title={zh ? "可交互分子结构" : "Interactive molecular structure"}
        />
        {status === "loading" && (
          <div className="viewer-message" role="status">
            <LoadingOutlined spin />
            {zh ? "正在读取结构…" : "Loading structure…"}
          </div>
        )}
        {status === "empty" && (
          <div className="viewer-message">
            <strong>
              {zh
                ? "选择文件或构象后，三维结构会显示在这里"
                : "Select a file or conformer to view its 3D structure"}
            </strong>
            <span>
              {zh
                ? "可拖动旋转、缩放并点选检查"
                : "Rotate, zoom and select atoms to inspect"}
            </span>
          </div>
        )}
        {error && (
          <div className="viewer-error" role="alert">
            {researchError(error, zh)}
            <button
              type="button"
              onClick={() => {
                setError("");
                send("load", { urls, comparison, focusModel, records });
              }}
            >
              {zh ? "重新加载" : "Reload"}
            </button>
          </div>
        )}
        {loaded && (
          <div className="viewer-tools">
            {(
              [
                ["zoom", 1, "放大", "Zoom in", PlusOutlined],
                ["zoom", -1, "缩小", "Zoom out", MinusOutlined],
                [
                  "reset",
                  undefined,
                  "回到全局",
                  "Full structure",
                  ReloadOutlined,
                ],
              ] as const
            ).map(([type, value, cn, en, Icon], i) => (
              <button
                type="button"
                key={i}
                title={zh ? cn : en}
                onClick={() => send(type, value)}
              >
                <Icon />
              </button>
            ))}
          </div>
        )}
      </div>
      {loaded && (
        <>
          {siteStatus && siteStatus.requested > 0 && (
            <p className="field-help" role="status">
              {zh ? "已定位区域残基：" : "Region residues located: "}
              {siteStatus.matched} / {siteStatus.requested}
              {siteStatus.matched < siteStatus.requested
                ? zh
                  ? " · 部分残基在当前结构中无法精确对应"
                  : " · Some residues could not be matched exactly"
                : ""}
            </p>
          )}
          <div className="viewer-footer">
            <button type="button" onClick={() => send("reset")}>
              {zh ? "回到全局" : "Full structure"}
            </button>
            {focusModel !== undefined && (
              <button
                type="button"
                onClick={() => send("focus-model", focusModel)}
              >
                {zh ? "定位所选配体" : "Focus selected ligand"}
              </button>
            )}
            {scene.chains
              .filter((chain) => chain.trim())
              .slice(0, 8)
              .map((chain) => (
                <button
                  type="button"
                  key={chain}
                  onClick={() => send("chain", chain)}
                >
                  {zh ? "链 " : "Chain "}
                  {chain}
                </button>
              ))}
            <span>
              {zh ? "拖动旋转 · 滚轮缩放" : "Drag to rotate · Scroll to zoom"}
            </span>
          </div>
          {scene.hasInteractionContext && !comparison && (
            <PoseScore value={nativeScore} language={language} />
          )}
          {scene.hasInteractionContext && !comparison && (
            <InteractionControls
              language={language}
              enabled={options.interactions}
              labels={options.labels}
              limit={options.contactLimit}
              summary={contacts}
              onChange={configure}
            />
          )}
          {!overlay && (
            <ViewerControls
              language={language}
              scene={scene}
              options={options}
              selection={selection}
              distance={distance}
              disabled={comparison}
              onOptions={configure}
              send={send}
            />
          )}
        </>
      )}
    </section>
  );
}
