import { version as productVersion } from "../../package.json";
import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import {
  LoadingOutlined,
  MinusOutlined,
  PlusOutlined,
  ReloadOutlined,
} from "@ant-design/icons";
import { Hint } from "../guided/Hint";
import { ViewerControls } from "./ViewerControls";
import { ChainControls } from "./ChainControls";
import { StructureSelectionSummary } from "./StructureInspectionSummary";
import { DisplayReadiness, displayCommands } from "./display-readiness";
import {
  StructureDisplayControls,
  StructureSequence,
} from "./StructureInspection";
import { SurfaceLegend } from "./SurfaceLegend";
import { InteractionControls } from "./InteractionControls";
import { PoseScore, type NativePoseScore } from "./PoseScore";
import {
  defaultOptions,
  emptyScene,
  type SceneInfo,
  type SelectionInfo,
  type ViewerOptions,
  type ViewMode,
  type PickMode,
  type ContactSummary,
  type SurfaceSummary,
  surfaceSummary,
} from "./protocol";
import type { Language } from "../types";
import type { DisplayResidue } from "./residue-region";
import { researchError } from "../presentation/research-content";
import "./viewer.css";
import { useViewerSnapshot } from "./useViewerSnapshot";
import { useViewerConnection } from "./useViewerConnection";
import { ViewerExportActions } from "./ViewerExportActions";
import { figureWithColorKeys } from "../publication/molecular-color-key";
import { scientificColorKeys } from "./scientific-color-keys";
import { electricColorBackground } from "./electric-color-scale";
import { ViewerToolGroup } from "./ViewerToolGroup";
import type { PoseController } from "./PoseSession";
import { PoseOptimizationControls } from "./PoseOptimizationControls";
import { InitialPoseStatus } from "./InitialPoseStatus";
import { poseError } from "./pose-errors";
import type { NativeInteraction } from "../integrations/types";
import { defaultPotentialRange, isPotentialRange } from "./potential-range";
import type { PotentialMap } from "./scientific-data";
import type { ChannelGeometry } from "./channel-geometry";
import type { AttachmentGeometry } from "./attachment-geometry";
import { ConfidenceControls, ConfidenceLegend } from "./ConfidenceControls";
import {
  confidenceIdentity,
  type ConfidenceBinding,
  type ConfidenceInspection,
} from "./confidence-types";
import type { SearchBoxGeometry } from "./search-box";
import type { StructureCameraHandle } from "./structure-camera";
import { useStructureCamera } from "./useStructureCamera";
import {
  useStructureFigure,
  type StructureFigureHandle,
} from "./useStructureFigure";
export interface StructureViewerProps {
  /** Atom/coordinate selection must use the exact source, never a mutable preview pose. */
  sourceSnapshot?: boolean;
  showWorkspaceControls?: boolean;
  onCameraReady?(handle: StructureCameraHandle | null): void;
  onFigureReady?(handle: StructureFigureHandle | null): void;
  figureFilename?: string;
  heading?: ReactNode;
  expectedStructureSha256?: string;
  structureChecksums?: readonly string[];
  cifAuthorResidues?: boolean;
  nativeArtifactSha256?: string;
  onStructureVerification?(verified: boolean): void;
  trajectoryKey?: string;
  ligandContext?: boolean;
  initialMode?: ViewMode;
  initialChains?: readonly string[];
  channelGeometry?: ChannelGeometry;
  searchBox?: SearchBoxGeometry;
  attachmentGeometry?: AttachmentGeometry;
  urls: string[];
  language: Language;
  focusResidue?: { residue: string; nonce: number } | null;
  focusLigand?: string | null;
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
  confidence?: ConfidenceBinding | null;
  confidenceSelection?: { key: string; tokens: number[]; nonce: number } | null;
  onConfidenceInspection?(value: ConfidenceInspection | null): void;
  onResiduesSelected?(keys: string[]): void;
  /** Optional destination in the same fullscreen workspace. Null awaits its mount. */
  sequenceHost?: HTMLElement | null;
  onConfidenceSelected?(value: { key: string; tokens: number[] }): void;
}
export function StructureViewport({
  sourceSnapshot = false,
  showWorkspaceControls = true,
  onCameraReady,
  onFigureReady,
  figureFilename,
  heading,
  expectedStructureSha256,
  structureChecksums,
  cifAuthorResidues,
  onStructureVerification,
  trajectoryKey,
  ligandContext = true,
  initialMode,
  initialChains,
  urls: originalUrls,
  language,
  focusResidue,
  focusLigand,
  comparison = false,
  focusModel,
  focusModels,
  residueRegion,
  selectionMode,
  highlightedAtoms,
  nativeInteractions,
  channelGeometry,
  searchBox,
  attachmentGeometry,
  electrostaticMap,
  onAtomSelected,
  onSceneLoaded,
  confidence,
  confidenceSelection,
  onConfidenceInspection,
  onResiduesSelected,
  sequenceHost,
  onConfidenceSelected,
  optimization,
}: StructureViewerProps & { optimization: PoseController }) {
  const { urls, records, score: nativeScore } = optimization.pose;
  const structureSha256 =
    optimization.pose.nativeArtifactSha256 ?? expectedStructureSha256;
  const previousTrajectory = useRef<string | undefined>(undefined);
  const requestedPotentialRange = electrostaticMap
    ? (electrostaticMap.range ?? defaultPotentialRange)
    : undefined;
  const sentPotentialRange = useRef<number | undefined>(undefined);
  const [appliedPotentialRange, setAppliedPotentialRange] = useState<number>();
  const [potentialPainted, setPotentialPainted] = useState(false);
  const optimizationReceiver = useRef(optimization);
  optimizationReceiver.current = optimization;
  const frame = useRef<HTMLIFrameElement>(null),
    zh = language === "zh",
    key =
      urls.join("|") +
      ":" +
      optimization.initialReady +
      ":" +
      (records?.join(",") ?? "") +
      ":" +
      JSON.stringify({
        expectedStructureSha256: structureSha256,
        structureChecksums,
        cifAuthorResidues,
        nativeInteractions,
        potentialSource: electrostaticMap && [
          electrostaticMap.url,
          electrostaticMap.unit,
        ],
        channelGeometry,
        initialMode,
        initialChains,
        ligandContext,
      });
  const connection = useViewerConnection(frame, urls.length > 0);
  const { ready } = connection;
  const sceneKey = `${connection.revision}:${key}`;
  const lastRequest = useRef<string | null>(null);
  const overlay = urls.length > 1;
  const requestedKey = useRef<string | null>(null);
  const [loadedKey, setLoadedKey] = useState<string | null>(null);
  const focusedLigand = useRef<string | null>(null);
  const snapshot = useViewerSnapshot(
      JSON.stringify([sceneKey, requestedPotentialRange]),
    ),
    snapshotReceiver = useRef(snapshot.receive);
  snapshotReceiver.current = snapshot.receive;
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
  const verificationCallback = useRef(onStructureVerification);
  verificationCallback.current = onStructureVerification;
  const [status, setStatus] = useState("empty"),
    [error, setError] = useState("");
  const [scene, setScene] = useState<SceneInfo>(emptyScene),
    [options, setOptions] = useState<ViewerOptions>(defaultOptions);
  const [hiddenChains, setHiddenChains] = useState<string[]>([]);
  const [hiddenResidues, setHiddenResidues] = useState<string[]>([]);
  const [selectedResidues, setSelectedResidues] = useState<string[]>([]);
  const [confidenceView, setConfidenceView] =
    useState<ConfidenceInspection | null>(null);
  const [confidenceUnavailable, setConfidenceUnavailable] = useState(false);
  const confidenceCallback = useRef(onConfidenceInspection);
  confidenceCallback.current = onConfidenceInspection;
  const residueCallback = useRef(onResiduesSelected);
  residueCallback.current = onResiduesSelected;
  const [nativeTokens, setNativeTokens] = useState<number[]>([]);
  const tokenCallback = useRef(onConfidenceSelected);
  tokenCallback.current = onConfidenceSelected;
  const confidenceKey = confidence ? confidenceIdentity(confidence) : "";
  const currentConfidence =
    confidenceView?.key === confidenceKey ? confidenceView : null;
  const expectedConfidence = useRef(confidenceKey);
  expectedConfidence.current = confidenceKey;
  const [displayPending, setDisplayPending] = useState(false);
  const [displayRevision, setDisplayRevision] = useState(0);
  const displayWork = useRef(new DisplayReadiness());
  const [selection, setSelection] = useState<SelectionInfo | null>(null),
    [distance, setDistance] = useState<number | null>(null);
  const [contacts, setContacts] = useState<ContactSummary | null>(null);
  const [attachmentCount, setAttachmentCount] = useState(0);
  const [surface, setSurface] = useState<SurfaceSummary | null>(null);
  const [siteStatus, setSiteStatus] = useState<{
    requested: number;
    matched: number;
  } | null>(null);
  function send(type: string, value?: unknown) {
    const requestId = displayCommands.includes(type)
      ? crypto.randomUUID()
      : undefined;
    if (requestId) {
      displayWork.current.begin(requestId);
      setDisplayPending(true);
    }
    frame.current?.contentWindow?.postMessage(
      {
        channel: "opendde-viewer",
        type,
        value,
        ...(requestId ? { requestId } : {}),
      },
      location.origin,
    );
  }
  function loadSpecification() {
    return {
      urls,
      expectedStructureSha256: structureSha256,
      structureChecksums,
      cifAuthorResidues,
      ...(trajectoryKey ? { trajectoryKey } : {}),
      ...(optimization.initialReady || sourceSnapshot
        ? { initialPosePrepared: true }
        : {}),
      ...(ligandContext ? {} : { ligandContext: false }),
      comparison,
      focusModel,
      ...(focusModels ? { focusModels } : {}),
      records,
      ...(initialMode ? { initialMode } : {}),
      ...(initialChains ? { initialChains } : {}),
      nativeInteractions,
      ...(channelGeometry ? { channelGeometry } : {}),
      ...(searchBox ? { searchBox } : {}),
      electrostaticMap,
    };
  }
  useLayoutEffect(() => {
    function message(event: MessageEvent) {
      if (
        event.origin !== location.origin ||
        event.source !== frame.current?.contentWindow ||
        event.data?.channel !== "opendde-viewer"
      )
        return;
      const { type, detail } = event.data;
      if (type === "initial-pose-required") {
        setStatus("preparing");
        if (optimizationReceiver.current.pose.source) {
          void optimizationReceiver.current.prepareInitial();
        } else {
          setStatus("error");
          setError(
            "Use a registered SDF/MOL source to prepare a calculated 3D pose.",
          );
        }
      }
      if (type === "snapshot") snapshotReceiver.current(detail);
      if (type === "ready") connection.receiveReady(detail);
      if (type === "selected") {
        setSelection(detail);
        selectionCallback.current?.(detail);
      }
      if (type === "contacts") setContacts(detail);
      if (
        type === "residue-visibility" &&
        Array.isArray(detail) &&
        detail.every((key) => typeof key === "string")
      ) {
        setHiddenResidues(detail);
      }
      if (
        type === "residue-selection" &&
        Array.isArray(detail) &&
        detail.every((key) => typeof key === "string")
      ) {
        setSelectedResidues(detail);
        residueCallback.current?.(detail);
      }
      if (type === "confidence-inspection") {
        if (!detail || detail.key === expectedConfidence.current) {
          setConfidenceView(detail);
          setNativeTokens([]);
          setConfidenceUnavailable(false);
          confidenceCallback.current?.(detail);
        }
      }
      if (type === "confidence-unavailable") setConfidenceUnavailable(true);
      if (
        type === "confidence-selected" &&
        detail?.key === expectedConfidence.current
      ) {
        setNativeTokens(detail.tokens);
        tokenCallback.current?.(detail);
      }
      if (
        type === "confidence-color" &&
        ["chain", "confidence"].includes(detail)
      )
        setOptions((o) => ({ ...o, color: detail }));
      if (type === "rendering" && typeof detail === "boolean") {
        displayWork.current.render(detail);
        setDisplayPending(displayWork.current.pending);
        if (!detail) setDisplayRevision((value) => value + 1);
      }
      if (type === "display-complete" && displayWork.current.complete(detail)) {
        setDisplayPending(displayWork.current.pending);
        setDisplayRevision((value) => value + 1);
      }
      if (
        type === "chain-display" &&
        Array.isArray(detail) &&
        detail.every((chain) => typeof chain === "string")
      )
        setHiddenChains(detail);
      if (
        type === "attachments" &&
        Number.isInteger(detail) &&
        detail >= 0 &&
        detail <= 16
      )
        setAttachmentCount(detail);
      if (type === "surface") setSurface(surfaceSummary(detail));
      if (type === "potential-surface") setPotentialPainted(detail === true);
      if (type === "potential-range" && isPotentialRange(detail))
        setAppliedPotentialRange(detail);
      if (type === "site-region") setSiteStatus(detail);
      if (type === "distance")
        setDistance(
          typeof detail === "number" && Number.isFinite(detail) ? detail : null,
        );
      if (type === "error") {
        setStatus("error");
        setError(String(detail));
        verificationCallback.current?.(false);
      }
      if (type === "loading") setStatus("loading");
      if (type === "loaded") {
        setAppliedPotentialRange(
          isPotentialRange(detail.potentialRange)
            ? detail.potentialRange
            : undefined,
        );
        setHiddenChains(detail.hiddenChains ?? []);
        setHiddenResidues([]);
        displayWork.current.reset();
        setDisplayPending(false);
        setSelectedResidues([]);
        setStatus("loaded");
        setLoadedKey(requestedKey.current);
        setError("");
        setScene(detail);
        sceneCallback.current?.(detail);
        verificationCallback.current?.(true);
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
  }, [connection.receiveReady]);
  useEffect(() => {
    if (!ready && urls.length) return;
    const specification = urls.length ? loadSpecification() : null;
    const request = JSON.stringify([sceneKey, specification]);
    if (lastRequest.current === request) return;
    lastRequest.current = ready ? request : null;
    verificationCallback.current?.(false);
    focusedLigand.current = null;
    setSelection(null);
    setSelectedResidues([]);
    setConfidenceView(null);
    setConfidenceUnavailable(false);
    confidenceCallback.current?.(null);
    residueCallback.current?.([]);
    setHiddenChains([]);
    setHiddenResidues([]);
    displayWork.current.reset();
    setDisplayPending(false);
    setDistance(null);
    setContacts(null);
    setAttachmentCount(0);
    setSurface(null);
    setPotentialPainted(false);
    setSiteStatus(null);
    setError("");
    setScene(emptyScene);
    if (!trajectoryKey || previousTrajectory.current !== trajectoryKey)
      setOptions(defaultOptions);
    previousTrajectory.current = trajectoryKey;
    if (ready && urls.length) {
      requestedKey.current = sceneKey;
      sentPotentialRange.current = requestedPotentialRange;
      send("load", specification);
      setStatus("loading");
    } else if (!urls.length) {
      requestedKey.current = null;
      if (ready) send("clear");
      setStatus("empty");
    }
  }, [
    ready,
    sceneKey,
    key,
    comparison,
    focusModel,
    focusKey,
    trajectoryKey,
    sourceSnapshot,
  ]);
  useEffect(() => {
    if (!focusLigand) {
      focusedLigand.current = null;
      return;
    }
    if (
      !ready ||
      status !== "loaded" ||
      loadedKey !== sceneKey ||
      !scene.ligands.some((ligand) => ligand.key === focusLigand)
    )
      return;
    const request = `${sceneKey}:${focusLigand}`;
    if (focusedLigand.current === request) return;
    focusedLigand.current = request;
    configure({ ligand: focusLigand });
  }, [ready, status, loadedKey, sceneKey, focusLigand, scene.ligands]);
  const attachmentKey = JSON.stringify(attachmentGeometry);
  const lastAttachment = useRef<string | undefined>(undefined);
  useEffect(() => {
    if (
      ready &&
      status === "loaded" &&
      loadedKey === sceneKey &&
      (attachmentGeometry !== undefined || lastAttachment.current !== undefined)
    ) {
      send("attachment-geometry", attachmentGeometry);
      lastAttachment.current = attachmentKey;
    }
  }, [ready, status, loadedKey, sceneKey, attachmentKey]);
  useEffect(() => {
    if (ready && status === "loaded" && loadedKey === sceneKey && focusResidue)
      send("residue", focusResidue.residue);
  }, [ready, status, loadedKey, sceneKey, focusResidue]);
  const regionKey = highlightedAtoms?.join(",") ?? "";
  const hadAtomRegion = useRef(false);
  const siteKey = JSON.stringify(residueRegion ?? []);
  useEffect(() => {
    if (
      ready &&
      status === "loaded" &&
      loadedKey === sceneKey &&
      residueRegion !== undefined
    )
      send("site-region", residueRegion);
  }, [ready, status, loadedKey, sceneKey, siteKey]);
  useEffect(() => {
    if (
      ready &&
      status === "loaded" &&
      loadedKey === sceneKey &&
      (highlightedAtoms !== undefined || hadAtomRegion.current)
    ) {
      send("atom-region", highlightedAtoms ?? []);
      hadAtomRegion.current = highlightedAtoms !== undefined;
    }
  }, [ready, status, loadedKey, sceneKey, regionKey]);
  function configure(value: Partial<ViewerOptions>) {
    if (value.mode) setSurface(null);
    setOptions((o) => ({ ...o, ...value }));
    send("options", value);
  }
  const loaded = ready && status === "loaded" && loadedKey === sceneKey;
  useStructureCamera(frame, sceneKey, loaded, onCameraReady);
  const displayBusy =
    displayPending ||
    (loaded && requestedPotentialRange !== appliedPotentialRange);
  const colorKeys =
    loaded && !comparison
      ? scientificColorKeys({
          mode: options.mode,
          confidence: Boolean(
            currentConfidence &&
            options.color === "confidence" &&
            scene.residues.length &&
            !overlay,
          ),
          hasPotentialMap: Boolean(electrostaticMap),
          potentialRange: potentialPainted ? appliedPotentialRange : undefined,
          surface,
          language,
        })
      : [];
  const figureKey = JSON.stringify([
    sceneKey,
    options,
    focusKey,
    focusModel,
    siteKey,
    attachmentKey,
    hiddenChains,
    selectedResidues,
    displayRevision,
  ]);
  const printFigureKey = JSON.stringify([figureKey, colorKeys]);
  function viewportAspect() {
    const bounds = frame.current?.getBoundingClientRect();
    return bounds && bounds.height > 0 ? bounds.width / bounds.height : 1.5;
  }
  useStructureFigure(
    figureKey,
    loaded && !displayBusy,
    (settings, pixels) => snapshot.figure(send, settings, pixels),
    onFigureReady,
  );
  useEffect(() => {
    if (
      loaded &&
      requestedPotentialRange !== undefined &&
      sentPotentialRange.current !== requestedPotentialRange
    ) {
      sentPotentialRange.current = requestedPotentialRange;
      send("potential-range", requestedPotentialRange);
    }
  }, [loaded, sceneKey, requestedPotentialRange]);
  const chainScope =
    loaded &&
    !comparison &&
    !overlay &&
    initialChains &&
    initialChains.length < scene.chains.length &&
    initialChains.every((chain) =>
      scene.residues.some((residue) => residue.chain === chain),
    )
      ? initialChains
      : null;
  const searchBoxKey = JSON.stringify(searchBox ?? null);
  const hadSearchBox = useRef(false);
  const hadConfidence = useRef(false);
  const lastConfidenceRequest = useRef("");
  useEffect(() => {
    const request = sceneKey + ":" + confidenceKey;
    if (
      loaded &&
      (confidence || hadConfidence.current) &&
      request !== lastConfidenceRequest.current
    ) {
      send("confidence", confidence ?? null);
      hadConfidence.current = Boolean(confidence);
      lastConfidenceRequest.current = request;
    }
  }, [loaded, sceneKey, confidenceKey]);
  const selectionKey = JSON.stringify(confidenceSelection);
  useEffect(() => {
    if (
      loaded &&
      currentConfidence &&
      confidenceSelection?.key === currentConfidence.key
    )
      send("confidence-selection", confidenceSelection);
  }, [loaded, currentConfidence?.key, selectionKey]);
  useEffect(() => {
    if (loaded && (searchBox !== undefined || hadSearchBox.current)) {
      send("search-box", searchBox);
      hadSearchBox.current = searchBox !== undefined;
    }
  }, [loaded, key, searchBoxKey]);
  const sequence = (
    <StructureSequence
      language={language}
      compact={sequenceHost !== undefined}
      residues={scene.residues}
      selected={selectedResidues}
      hiddenChains={hiddenChains}
      hiddenResidues={hiddenResidues}
      busy={displayPending}
      confidence={currentConfidence?.residueScores}
      nativeSelectionCount={currentConfidence ? nativeTokens.length : 0}
      onSelect={(key, mode) => send("sequence-selection", { key, mode })}
      onClear={() => send("selection-action", "clear")}
      onRestore={() => send("selection-action", "restore")}
    />
  );
  const title = scene.hasPolymer
    ? zh
      ? "三维结构"
      : "3D structure"
    : zh
      ? "分子三维预览"
      : "3D molecule";
  return (
    <section className="studio-panel viewer-panel">
      <div className="studio-heading">
        {heading ?? (
          <h3 aria-label={title}>
            <span className="viewer-title-full">{title}</span>
            <span className="viewer-title-short" aria-hidden="true">
              {zh ? "三维" : "3D"}
            </span>
            <Hint label={zh ? "三维预览说明" : "3D preview help"}>
              {zh
                ? "拖动旋转，滚轮缩放。绿色细棒突出配体；色带显示大分子骨架。点选原子或残基后，可在下方调整显示。"
                : "Drag to rotate and scroll to zoom. Thin green sticks highlight ligands; ribbons show polymer backbones. Select atoms or residues to adjust their display below."}
            </Hint>
          </h3>
        )}
        {attachmentGeometry !== undefined && (
          <span
            className="viewer-attachment-count"
            role="status"
            aria-label={zh ? "连接位点标记" : "Attachment markers"}
          >
            {attachmentCount} {zh ? "处连接标记" : "attachment markers"}
          </span>
        )}
        <ViewerExportActions
          language={language}
          filename={figureFilename}
          showWorkspaceControls={showWorkspaceControls}
          originalUrls={
            optimization.pose.nativeArtifactSha256 || structureChecksums
              ? []
              : urls
          }
          sourceKey={printFigureKey}
          sourceReady={loaded && !displayBusy}
          busy={snapshot.busy}
          aspect={viewportAspect}
          render={(settings) =>
            colorKeys.length
              ? figureWithColorKeys(
                  settings,
                  viewportAspect(),
                  colorKeys,
                  (value, pixels) => snapshot.figure(send, value, pixels),
                )
              : snapshot.figure(send, settings)
          }
          capture={(scale) => snapshot.begin(send, scale)}
          leading={
            channelGeometry && (
              <button
                type="button"
                disabled={!loaded}
                onClick={() => send("focus-channel")}
              >
                {zh ? "定位通道" : "Focus channel"}
              </button>
            )
          }
        />
      </div>
      {chainScope && (
        <div
          className="segmented viewer-modes"
          role="group"
          aria-label={zh ? "复合物显示范围" : "Complex view scope"}
        >
          <button
            type="button"
            aria-pressed={
              scene.chains
                .filter((chain) => !hiddenChains.includes(chain))
                .every((chain) => chainScope.includes(chain)) &&
              scene.chains.length - hiddenChains.length === chainScope.length
            }
            onClick={() =>
              send("chain-display", { action: "subset", chains: chainScope })
            }
          >
            {zh ? "所选蛋白链" : "Selected chains"}
          </button>
          <button
            type="button"
            aria-pressed={hiddenChains.length === 0}
            onClick={() => send("chain-display", { action: "all" })}
          >
            {zh ? "完整参考结构" : "Full reference"}
          </button>
        </div>
      )}
      {loaded && !comparison && (!overlay || scene.hasInteractionContext) && (
        <div className="segmented viewer-modes viewer-mode-options">
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
                (ligandContext &&
                  scene.hasPolymer &&
                  (scene.ligands.length > 0 || scene.hasInteractionContext)),
            )
            .map(([id, cn, en]) => (
              <button
                type="button"
                key={id}
                className={options.mode === id ? "selected" : ""}
                aria-pressed={options.mode === id}
                aria-label={zh ? cn : en}
                disabled={!loaded || comparison}
                onClick={() => configure({ mode: id })}
              >
                {id === "pocket" && !zh ? (
                  <>
                    <span className="viewer-mode-short" aria-hidden="true">
                      Pocket
                    </span>
                    <span className="viewer-mode-full">{en}</span>
                  </>
                ) : zh ? (
                  cn
                ) : (
                  en
                )}
              </button>
            ))}
          {!overlay && scene.chains.length > 0 && (
            <ChainControls
              language={language}
              chains={scene.chains}
              hidden={hiddenChains.filter((chain) =>
                scene.chains.includes(chain),
              )}
              onDisplay={(value) => send("chain-display", value)}
              onFocus={(chain) => send("chain", chain)}
            />
          )}
          {!overlay && scene.hasPolymer && (
            <ViewerToolGroup
              kind="display"
              label={zh ? "显示选项" : "Display options"}
            >
              <StructureDisplayControls
                language={language}
                options={options}
                onChange={configure}
              />
              {confidence && (
                <ConfidenceControls
                  language={language}
                  ready={Boolean(currentConfidence)}
                  color={options.color}
                  onColor={(color) => configure({ color })}
                />
              )}
            </ViewerToolGroup>
          )}
        </div>
      )}
      {comparison && (
        <p className="viewer-comparison">
          {zh
            ? "蓝 / 橙 / 紫表示不同构象。退出叠加后可编辑单个结构的显示。"
            : "Blue / orange / purple identify conformers. Leave overlay to edit an individual structure's display."}
        </p>
      )}
      {loaded &&
        currentConfidence &&
        !scene.hasPolymer &&
        nativeTokens.length > 0 && (
          <button
            type="button"
            onClick={() => send("selection-action", "clear")}
          >
            {zh ? "清除置信度选择" : "Clear confidence selection"} (
            {nativeTokens.length})
          </button>
        )}
      {confidenceUnavailable && (
        <p role="status" className="field-help">
          {zh
            ? "此构象的原子对应关系无法核验，继续按链显示。"
            : "Atom identities could not be verified for this conformer. Chain colors remain available."}
        </p>
      )}
      <div className="molecular-stage">
        <iframe
          key={connection.frameKey}
          ref={frame}
          onLoad={connection.onLoad}
          src={`/viewer.html?v=${encodeURIComponent(productVersion)}`}
          title={zh ? "可交互分子结构" : "Interactive molecular structure"}
        />
        {loaded &&
          options.mode === "surface" &&
          potentialPainted &&
          appliedPotentialRange !== undefined && (
            <div className="potential-legend" role="status">
              <span>{zh ? "APBS 电势" : "APBS potential"}</span>
              <span>−{appliedPotentialRange}</span>
              <i
                aria-hidden="true"
                style={{ backgroundImage: electricColorBackground }}
              />
              <span>+{appliedPotentialRange} kBT/e</span>
            </div>
          )}
        {(status === "loading" || (!ready && urls.length > 0)) &&
          !connection.failed && (
            <div className="viewer-message" role="status">
              <LoadingOutlined spin />
              {zh ? "正在读取结构…" : "Loading structure…"}
            </div>
          )}
        {status === "preparing" && (
          <InitialPoseStatus state={optimization} language={language} />
        )}
        {status === "empty" && urls.length === 0 && (
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
        {(error || connection.failed) && (
          <div className="viewer-error" role="alert">
            {connection.failed
              ? zh
                ? "三维预览未能启动，请重新加载。"
                : "3D preview could not start. Reload the preview."
              : poseError(error, zh)}
            <button
              type="button"
              onClick={() => {
                setError("");
                connection.reload();
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
                ["reset", undefined, "重置视角", "Reset view", ReloadOutlined],
              ] as const
            ).map(([type, value, cn, en, Icon], i) => (
              <button
                type="button"
                key={i}
                aria-label={zh ? cn : en}
                title={zh ? cn : en}
                onClick={() => send(type, value)}
              >
                <Icon />
              </button>
            ))}
          </div>
        )}
      </div>
      {loaded && !overlay && !comparison && (
        <StructureSelectionSummary
          language={language}
          residues={scene.residues}
          selected={selectedResidues}
          selection={selection}
          confidence={currentConfidence}
          nativeTokens={currentConfidence ? nativeTokens : []}
          busy={displayPending}
          onFocus={() => send("selection-action", "focus")}
          onClear={() => send("selection-action", "clear")}
        />
      )}
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
            {snapshot.downloadUrl && (
              <a
                className="secondary-button"
                href={snapshot.downloadUrl}
                download={`${figureFilename ?? "X-DDE-structure"}-view.png`}
              >
                {zh ? "下载视图 PNG" : "Download view PNG"}
              </a>
            )}
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
              {chainScope
                ? zh
                  ? "适应当前视图"
                  : "Fit current view"
                : zh
                  ? "回到全局"
                  : "Full structure"}
            </button>
            {siteStatus && siteStatus.matched > 0 && (
              <button
                type="button"
                disabled={!loaded}
                onClick={() => send("focus-site")}
              >
                {zh ? "定位选区" : "Focus region"}
              </button>
            )}
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
            {(comparison || overlay) &&
              scene.chains
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
          {ligandContext && scene.hasInteractionContext && !comparison && (
            <PoseScore value={nativeScore} language={language} />
          )}
          {ligandContext &&
            scene.hasInteractionContext &&
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
          {ligandContext && nativeInteractions !== undefined && (
            <div className="inline-fields">
              <label className="checkbox-label">
                <input
                  type="checkbox"
                  checked={options.interactions}
                  onChange={(e) =>
                    configure({ interactions: e.target.checked })
                  }
                />
                {zh ? "显示原生化学接触" : "Show native chemical contacts"}
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
              ligandContext={ligandContext}
              language={language}
              scene={scene}
              options={options}
              selection={selection}
              hasDisplaySelection={
                selectedResidues.length > 0 ||
                Boolean(currentConfidence && nativeTokens.length)
              }
              distance={distance}
              disabled={comparison}
              onOptions={configure}
              send={send}
            />
          )}
        </>
      )}
      {loaded && scene.residues.length > 0 && !overlay && !comparison && (
        <>
          {currentConfidence && options.color === "confidence" && (
            <ConfidenceLegend language={language} />
          )}
          {sequenceHost
            ? createPortal(sequence, sequenceHost)
            : sequenceHost === undefined
              ? sequence
              : null}
        </>
      )}
      {!sourceSnapshot &&
        !comparison &&
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
