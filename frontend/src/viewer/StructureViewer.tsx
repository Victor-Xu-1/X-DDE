import { version as productVersion } from "../../package.json";
import { useEffect, useRef, useState } from "react";
import {
  CameraOutlined,
  FullscreenOutlined,
  DownloadOutlined,
  LoadingOutlined,
  MinusOutlined,
  PlusOutlined,
  ReloadOutlined,
} from "@ant-design/icons";
import { Hint } from "../guided/Hint";
import { ViewerControls } from "./ViewerControls";
import { SurfaceLegend } from "./SurfaceLegend";
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
  type SurfaceSummary,
  surfaceSummary,
  validSource,
} from "./protocol";
import type { Language } from "../types";
import type { DisplayResidue } from "./residue-region";
import { researchError } from "../presentation/research-content";
import "./viewer.css";
import { useViewerSnapshot } from "./useViewerSnapshot";
import { usePoseOptimization } from "./usePoseOptimization";
import { poseSource } from "./pose-source";
import { PoseOptimizationControls } from "./PoseOptimizationControls";
import type { NativeInteraction } from "../integrations/types";
import type { PotentialMap } from "./scientific-data";
import type { ChannelGeometry } from "./channel-geometry";
interface Props {
  channelGeometry?: ChannelGeometry;
  urls: string[];
  language: Language;
  focusResidue?: { residue: string; nonce: number } | null;
  comparison?: boolean;
  focusModel?: number;
  focusModels?: number[];
  records?: number[];
  residueRegion?: DisplayResidue[];
  selectionMode?: PickMode;
  highlightedAtoms?: number[];
  nativeScore?: NativePoseScore | null;
  molecularSource?: { url: string; record?: number };
  nativeInteractions?: NativeInteraction[];
  electrostaticMap?: PotentialMap;
  onAtomSelected?(selection: SelectionInfo | null): void;
  onSceneLoaded?(scene: SceneInfo): void;
}
export function StructureViewer({
  urls: originalUrls,
  language,
  focusResidue,
  comparison = false,
  focusModel,
  focusModels,
  records: originalRecords,
  residueRegion,
  selectionMode,
  highlightedAtoms,
  nativeScore: originalScore,
  molecularSource,
  nativeInteractions,
  channelGeometry,
  electrostaticMap,
  onAtomSelected,
  onSceneLoaded,
}: Props) {
  const poseIndex = molecularSource
    ? originalUrls.indexOf(molecularSource.url)
    : originalUrls.length === 1
      ? 0
      : -1;
  const optimization = usePoseOptimization(
    {
      urls: originalUrls,
      records: originalRecords,
      score: originalScore,
      source:
        !comparison && poseIndex >= 0
          ? poseSource(
              originalUrls[poseIndex],
              molecularSource?.record ?? originalRecords?.[poseIndex] ?? 0,
            )
          : null,
      receptor:
        !comparison &&
        molecularSource &&
        originalUrls.length === 2 &&
        poseIndex === 1
          ? poseSource(originalUrls[0], originalRecords?.[0] ?? 0)
          : null,
    },
    poseIndex,
  );
  const { urls, records, score: nativeScore } = optimization.pose;
  const frame = useRef<HTMLIFrameElement>(null),
    zh = language === "zh",
    key =
      urls.join("|") +
      ":" +
      (records?.join(",") ?? "") +
      ":" +
      JSON.stringify({ nativeInteractions, electrostaticMap, channelGeometry });
  const overlay = urls.length > 1;
  const requestedKey = useRef<string | null>(key);
  const [loadedKey, setLoadedKey] = useState<string | null>(null);
  const snapshot = useViewerSnapshot(key),
    snapshotReceiver = useRef(snapshot.receive);
  snapshotReceiver.current = snapshot.receive;
  const [imageScale, setImageScale] = useState(2);
  const focusKey = focusModels?.join(",") ?? "";
  const focusedModels = useRef(focusModels);
  focusedModels.current = focusModels;
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
  const [surface, setSurface] = useState<SurfaceSummary | null>(null);
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
      if (type === "snapshot") snapshotReceiver.current(detail);
      if (type === "ready") setReady(true);
      if (type === "selected") {
        setSelection(detail);
        selectionCallback.current?.(detail);
      }
      if (type === "contacts") setContacts(detail);
      if (type === "surface") setSurface(surfaceSummary(detail));
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
        setLoadedKey(requestedKey.current);
        setError("");
        setScene(detail);
        sceneCallback.current?.(detail);
        if (focusedModels.current?.length)
          send("focus-models", focusedModels.current);
        else if (focusedModel.current !== undefined)
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
    setSurface(null);
    setSiteStatus(null);
    setError("");
    setScene(emptyScene);
    setOptions(defaultOptions);
    if (ready && urls.length) {
      requestedKey.current = key;
      send("load", {
        urls,
        comparison,
        focusModel,
        ...(focusModels ? { focusModels } : {}),
        records,
        nativeInteractions,
        ...(channelGeometry ? { channelGeometry } : {}),
        electrostaticMap,
      });
      setStatus("loading");
    } else if (!urls.length) {
      requestedKey.current = null;
      if (ready) send("clear");
      setStatus("empty");
    }
  }, [ready, key, comparison, focusModel, focusKey]);
  useEffect(() => {
    if (ready && focusResidue) send("residue", focusResidue.residue);
  }, [ready, focusResidue]);
  const regionKey = highlightedAtoms?.join(",") ?? "";
  const siteKey = JSON.stringify(residueRegion ?? []);
  useEffect(() => {
    if (
      ready &&
      status === "loaded" &&
      loadedKey === key &&
      residueRegion !== undefined
    )
      send("site-region", residueRegion);
  }, [ready, status, loadedKey, key, siteKey]);
  useEffect(() => {
    if (ready && status === "loaded" && loadedKey === key)
      send("atom-region", highlightedAtoms ?? []);
  }, [ready, status, loadedKey, key, regionKey]);
  function configure(value: Partial<ViewerOptions>) {
    if (value.mode) setSurface(null);
    setOptions((o) => ({ ...o, ...value }));
    send("options", value);
  }
  const loaded = status === "loaded" && loadedKey === key;
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
        <div className="viewer-heading-actions">
          {channelGeometry && (
            <button
              type="button"
              disabled={!loaded}
              onClick={() => send("focus-channel")}
            >
              {zh ? "定位通道" : "Focus channel"}
            </button>
          )}
          {urls.length > 0 && (
            <details className="viewer-original-downloads">
              <summary
                aria-label={zh ? "下载结构文件" : "Download structure files"}
                title={zh ? "下载结构文件" : "Download structure files"}
              >
                <DownloadOutlined />
              </summary>
              <div>
                {urls
                  .filter((url) => {
                    try {
                      validSource(url, location.origin);
                      return true;
                    } catch {
                      return false;
                    }
                  })
                  .map((url, index) => (
                    <a key={url} href={url} download>
                      {zh ? "结构 " : "Structure "}
                      {index + 1}
                    </a>
                  ))}
              </div>
            </details>
          )}
          <select
            className="viewer-export-size"
            value={imageScale}
            aria-label={zh ? "三维图片清晰度" : "3D image resolution"}
            onChange={(e) => setImageScale(Number(e.target.value))}
          >
            <option value="1">{zh ? "屏幕 1×" : "Screen 1×"}</option>
            <option value="2">{zh ? "清晰 2×" : "Clear 2×"}</option>
            <option value="3">{zh ? "精细 3×" : "Fine 3×"}</option>
          </select>
          <button
            type="button"
            disabled={!loaded || snapshot.busy}
            aria-label={zh ? "生成三维视图图片" : "Capture 3D view"}
            title={zh ? "生成三维视图图片" : "Capture 3D view"}
            onClick={() => snapshot.begin(send, imageScale)}
          >
            <CameraOutlined />
          </button>
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
      </div>
      {loaded && !comparison && (!overlay || scene.hasInteractionContext) && (
        <div className="segmented viewer-modes">
          {(
            [
              [
                "cartoon",
                scene.hasPolymer ? "整体骨架" : "棒状结构",
                scene.hasPolymer ? "Backbone" : "Sticks",
              ],
              ["pocket", "配体与口袋", "Ligand and pocket"],
              ["surface", "分子表面", "Surface"],
            ] as const
          )
            .filter(
              ([id]) =>
                id !== "pocket" ||
                (scene.hasPolymer &&
                  (scene.ligands.length > 0 || scene.hasInteractionContext)),
            )
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
                send("load", {
                  urls,
                  comparison,
                  focusModel,
                  ...(focusModels ? { focusModels } : {}),
                  records,
                  nativeInteractions,
                  ...(channelGeometry ? { channelGeometry } : {}),
                  electrostaticMap,
                });
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
      {snapshot.failed && (
        <p role="status" className="field-help">
          {zh
            ? "图片未能生成，请稍后重试。"
            : "Image capture failed; try again."}
        </p>
      )}
      {snapshot.image && (
        <figure className="viewer-snapshot">
          <img
            src={snapshot.image}
            alt={zh ? "当前三维视图图片" : "Current 3D view image"}
          />
          <figcaption>
            <a
              className="secondary-button"
              href={snapshot.image}
              download="X-DDE-structure-view.png"
            >
              {zh ? "下载视图 PNG" : "Download view PNG"}
            </a>
            <button
              type="button"
              className="secondary-button"
              onClick={snapshot.close}
            >
              {zh ? "关闭图片" : "Close image"}
            </button>
          </figcaption>
        </figure>
      )}
      {loaded && (
        <>
          {options.mode === "surface" && !comparison && !electrostaticMap && (
            <SurfaceLegend summary={surface} language={language} />
          )}
          {options.mode === "surface" && electrostaticMap && (
            <div className="potential-legend">
              <span>{zh ? "APBS 电势" : "APBS potential"}</span>
              <span>−{electrostaticMap.range ?? 5}</span>
              <i />
              <span>+{electrostaticMap.range ?? 5} kBT/e</span>
            </div>
          )}
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
            {focusModels?.length ? (
              <button
                type="button"
                onClick={() => send("focus-models", focusModels)}
              >
                {zh ? "定位比较姿势" : "Focus compared poses"}
              </button>
            ) : null}
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
          {scene.hasInteractionContext &&
            !comparison &&
            nativeInteractions === undefined && (
              <InteractionControls
                language={language}
                enabled={options.interactions}
                labels={options.labels}
                limit={options.contactLimit}
                summary={contacts}
                onChange={configure}
              />
            )}
          {nativeInteractions !== undefined && (
            <div className="inline-fields">
              <label className="checkbox-label">
                <input
                  type="checkbox"
                  checked={options.interactions}
                  onChange={(e) =>
                    configure({ interactions: e.target.checked })
                  }
                />
                {zh ? "显示 PLIP 相互作用" : "Show PLIP interactions"}
              </label>
              <label className="checkbox-label">
                <input
                  type="checkbox"
                  checked={options.labels}
                  onChange={(e) => configure({ labels: e.target.checked })}
                />
                {zh ? "显示残基与距离" : "Show residues and distances"}
              </label>
              <select
                aria-label={zh ? "关注残基数" : "Focus residues"}
                value={options.contactLimit}
                onChange={(e) =>
                  configure({
                    contactLimit:
                      e.target.value === "all"
                        ? "all"
                        : (Number(e.target.value) as 3 | 5),
                  })
                }
              >
                <option value={3}>3</option>
                <option value={5}>5</option>
                <option value="all">{zh ? "全部" : "All"}</option>
              </select>
            </div>
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
      {!comparison &&
        (optimization.count > 1 ||
          optimization.busy ||
          (loaded &&
            ((!overlay && !scene.hasPolymer) ||
              (overlay &&
                scene.hasInteractionContext &&
                optimization.pose.receptor)))) && (
          <PoseOptimizationControls
            state={optimization}
            language={language}
            disabled={!loaded}
          />
        )}
    </section>
  );
}
