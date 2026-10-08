import * as mol from "3dmol";
import { focusedViewScale } from "./appearance";
import { contactLabelLayer } from "./contact-labels";
import { molecularRecordText } from "../presentation/molecular-record";
import {
  complexLigandModel,
  viewerLoad,
  type ViewerLoad,
} from "./source-layout";
import { MolecularScene } from "./scene";
import { inputChargesDeclared } from "./charge-surface";
import { validSource } from "./protocol";
import { spatialMolecule } from "./initial-geometry";
import { initializeTheme } from "../theme";
import "./frame.css";
import { captureView } from "./capture";
import { potentialData } from "./scientific-overlay";
import {
  resizeZoomFactor,
  viewportFitFactor,
  type ViewportSize,
} from "./camera-resize";
initializeTheme();
const background = () =>
  getComputedStyle(document.documentElement)
    .getPropertyValue("--chart-bg")
    .trim();
const viewer = mol.createViewer(document.getElementById("molecule")!, {
  backgroundColor: background(),
  antialias: true,
});
viewer.setViewChangeCallback(() => contactLabelLayer(viewer).layout());
new MutationObserver(() => {
  viewer.setBackgroundColor(background(), 1);
  viewer.render();
}).observe(document.documentElement, {
  attributes: true,
  attributeFilter: ["data-theme"],
});
let previousViewport: ViewportSize | null = null;
new ResizeObserver(([entry]) => {
  const next = {
    width: entry.contentRect.width,
    height: entry.contentRect.height,
  };
  viewer.resize();
  if (previousViewport && viewer.getModel(0)) {
    const factor = resizeZoomFactor(previousViewport, next);
    if (Math.abs(factor - 1) > 0.001) viewer.zoom(factor);
  }
  if (next.width > 0 && next.height > 0) previousViewport = next;
  viewer.render();
}).observe(document.getElementById("molecule")!);
function notify(type: string, detail: unknown = {}) {
  window.parent.postMessage(
    { channel: "opendde-viewer", type, detail },
    location.origin,
  );
}
const scene = new MolecularScene(viewer, notify, () =>
  document.getElementById("molecule")!.getBoundingClientRect(),
);
let controller: AbortController | null = null,
  generation = 0;
let loadedSourceIdentity: string | null = null;
let loadedTrajectoryKey: string | undefined;
function reset() {
  const viewport = document.getElementById("molecule")!.getBoundingClientRect();
  viewer.zoomTo();
  viewer.zoom(0.85 * viewportFitFactor(viewport));
  if (viewport.width > 0 && viewport.height > 0)
    previousViewport = { width: viewport.width, height: viewport.height };
  viewer.render();
}
async function load(input: ViewerLoad) {
  const { urls } = input;
  const sourceIdentity = JSON.stringify({
    urls,
    records: input.records,
    comparison: input.comparison,
  });
  const retainedView =
    (input.channelGeometry && loadedSourceIdentity === sourceIdentity) ||
    (input.trajectoryKey &&
      loadedTrajectoryKey === input.trajectoryKey &&
      loadedSourceIdentity)
      ? viewer.getView()
      : undefined;
  const retainedOptions =
    input.trajectoryKey && retainedView ? { ...scene.options } : undefined;
  loadedSourceIdentity = null;
  controller?.abort();
  controller = new AbortController();
  const request = controller,
    current = ++generation;
  scene.resetState();
  notify("loading");
  viewer.clear();
  try {
    let molecular = false;
    const formats: string[] = [];
    const inputCharges: boolean[] = [];
    for (const [sourceIndex, raw] of urls.entries()) {
      const response = await fetch(validSource(raw, location.origin), {
        signal: request.signal,
      });
      if (
        !response.ok ||
        Number(response.headers.get("Content-Length")) > 10000000
      )
        throw new Error("Structure could not be loaded");
      const text = await response.text();
      if (text.length > 10000000)
        throw new Error("Structure is too large for the viewer");
      if (current !== generation) return;
      const source = validSource(raw, location.origin);
      const suffix =
        response.headers.get("X-Structure-Format") ||
        source.searchParams.get("name")?.split(".").pop()?.toLowerCase() ||
        "cif";
      if (!["pdb", "cif", "sdf", "mol", "mol2"].includes(suffix))
        throw new Error("Unsupported molecular display format");
      const format = suffix;
      formats.push(format);
      molecular = urls.length === 1 && ["sdf", "mol", "mol2"].includes(format);
      const record = molecularRecordText(
        text,
        input.records?.[sourceIndex] ?? 0,
        format,
      );
      if (["sdf", "mol", "mol2"].includes(format)) {
        if (urls.length === 1 && !input.initialPosePrepared) {
          notify("initial-pose-required");
          return;
        }
      }
      inputCharges.push(inputChargesDeclared(record, format));
      const model = viewer.addModel(record, format);
      if (
        ["sdf", "mol", "mol2"].includes(format) &&
        !spatialMolecule(
          model.selectedAtoms({}),
          /\b3D\b/.test(record.split(/\r?\n/)[1] ?? ""),
        )
      ) {
        viewer.clear();
        throw new Error(
          "This ligand has only 2D coordinates. Prepare and dock a 3D pose before displaying it with a receptor.",
        );
      }
      if (!model.selectedAtoms({}).length)
        throw new Error("No atoms were found in the structure");
    }
    scene.inspect(
      urls.length > 1,
      molecular,
      formats,
      complexLigandModel(formats, input),
      inputCharges,
    );
    scene.nativeInteractions = input.nativeInteractions;
    if (input.ligandContext === false) {
      scene.options.interactions = false;
      scene.options.mode = "cartoon";
    }
    if (input.initialMode) {
      scene.options.mode = input.initialMode;
      if (input.initialMode === "cartoon") scene.options.labels = false;
    }
    if (retainedOptions) Object.assign(scene.options, retainedOptions);
    scene.channelGeometry = input.channelGeometry;
    if (input.channelGeometry) {
      scene.options.mode = "cartoon";
      scene.options.labels = false;
    }
    if (input.electrostaticMap) {
      const response = await fetch(
        validSource(input.electrostaticMap.url, location.origin),
        { signal: request.signal },
      );
      if (
        !response.ok ||
        Number(response.headers.get("Content-Length")) > 35000000
      )
        throw new Error("Potential map could not be loaded");
      const text = await response.text();
      if (text.length > 35000000) throw new Error("Potential map is too large");
      if (current !== generation) return;
      scene.potential = {
        data: potentialData(text),
        range: input.electrostaticMap.range ?? 5,
      };
      scene.options.mode = "surface";
    }
    await scene.paint();
    if (current !== generation) return;
    reset();
    if (retainedView) viewer.setView(retainedView);
    else if (scene.channelGeometry) scene.focusChannel();
    loadedSourceIdentity = sourceIdentity;
    loadedTrajectoryKey = input.trajectoryKey;
    if (
      !retainedView &&
      scene.options.mode === "pocket" &&
      !scene.channelGeometry
    )
      scene.focusLigand();
    notify("loaded", { ...scene.info, options: scene.options });
  } catch (error) {
    if (!request.signal.aborted && current === generation) {
      viewer.clear();
      viewer.render();
      notify("error", String(error));
    }
  }
}
async function command(type: string, value: unknown) {
  try {
    if (type === "options" && value && typeof value === "object")
      await scene.configure(value);
    if (type === "selection-action" && typeof value === "string")
      await scene.action(value);
    if (type === "residue" && typeof value === "string")
      await scene.selectResidue(value);
    if (type === "atom-region") await scene.highlightAtoms(value);
    if (type === "site-region") await scene.highlightResidues(value);
    if (type === "attachment-geometry") await scene.showAttachments(value);
  } catch {
    notify("error", "Could not update structure display.");
  }
}
window.addEventListener("message", (event) => {
  if (
    event.origin !== location.origin ||
    event.source !== window.parent ||
    event.data?.channel !== "opendde-viewer"
  )
    return;
  const { type, value } = event.data;
  if (type === "clear") {
    loadedSourceIdentity = null;
    controller?.abort();
    generation++;
    scene.resetState();
    viewer.clear();
    viewer.render();
  }
  if (type === "load") {
    try {
      void load(viewerLoad(value));
    } catch {
      notify("error", "Invalid structure request.");
    }
  }
  if (
    [
      "options",
      "selection-action",
      "residue",
      "atom-region",
      "site-region",
      "attachment-geometry",
    ].includes(type)
  )
    void command(type, value);
  if (
    type === "focus-model" &&
    typeof value === "number" &&
    Number.isInteger(value) &&
    value >= 0 &&
    value < 3 &&
    viewer.getModel(value)
  ) {
    scene.focusModel(value);
  }
  if (
    type === "focus-models" &&
    Array.isArray(value) &&
    value.length > 0 &&
    value.length <= 3 &&
    new Set(value).size === value.length &&
    value.every(
      (index) =>
        Number.isInteger(index) &&
        index >= 0 &&
        index < 3 &&
        viewer.getModel(index),
    )
  ) {
    viewer.zoomTo({ model: value });
    viewer.zoom(focusedViewScale);
    viewer.render();
  }
  if (type === "reset") reset();
  const capture = typeof value === "string" ? { id: value, scale: 1 } : value;
  if (
    type === "snapshot" &&
    capture &&
    typeof capture === "object" &&
    typeof capture.id === "string" &&
    /^[0-9a-f-]{36}$/.test(capture.id) &&
    [1, 2, 3].includes(capture.scale) &&
    viewer.getModel(0)
  ) {
    try {
      notify("snapshot", {
        id: capture.id,
        png: captureView(
          viewer,
          document.getElementById("molecule")!,
          capture.scale,
        ),
      });
    } catch {
      notify("snapshot", { id: capture.id, png: null });
    }
  }
  if (type === "focus-ligand") scene.focusLigand();
  if (type === "focus-channel") scene.focusChannel();
  if (type === "zoom") {
    viewer.zoom(value === 1 ? 1.2 : 0.8);
    viewer.render();
  }
  if (type === "chain" && typeof value === "string") {
    if (value === "all") reset();
    else {
      const viewport = document
        .getElementById("molecule")!
        .getBoundingClientRect();
      viewer.zoomTo({ chain: value });
      viewer.zoom(viewportFitFactor(viewport));
      viewer.render();
    }
  }
});
notify("ready");
