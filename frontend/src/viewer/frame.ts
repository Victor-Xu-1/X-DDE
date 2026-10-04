import * as mol from "3dmol";
import { molecularRecordText } from "../presentation/molecular-record";
import {
  complexLigandModel,
  viewerLoad,
  type ViewerLoad,
} from "./source-layout";
import { MolecularScene } from "./scene";
import { inputChargesDeclared } from "./charge-surface";
import { validSource } from "./protocol";
import { initializeTheme } from "../theme";
import "./frame.css";
import { captureView } from "./capture";
initializeTheme();
const background = () =>
  getComputedStyle(document.documentElement)
    .getPropertyValue("--chart-bg")
    .trim();
const viewer = mol.createViewer(document.getElementById("molecule")!, {
  backgroundColor: background(),
  antialias: true,
});
new MutationObserver(() => {
  viewer.setBackgroundColor(background(), 1);
  viewer.render();
}).observe(document.documentElement, {
  attributes: true,
  attributeFilter: ["data-theme"],
});
new ResizeObserver(() => {
  viewer.resize();
  viewer.render();
}).observe(document.getElementById("molecule")!);
function notify(type: string, detail: unknown = {}) {
  window.parent.postMessage(
    { channel: "opendde-viewer", type, detail },
    location.origin,
  );
}
const scene = new MolecularScene(viewer, notify);
let controller: AbortController | null = null,
  generation = 0;
function reset() {
  viewer.zoomTo();
  viewer.zoom(0.85);
  viewer.render();
}
async function load(input: ViewerLoad) {
  const { urls } = input;
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
      inputCharges.push(inputChargesDeclared(record, format));
      const model = viewer.addModel(record, format);
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
    await scene.paint();
    if (current !== generation) return;
    reset();
    if (scene.options.mode === "pocket") scene.focusLigand();
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
    viewer.zoomTo({ model: value });
    viewer.zoom(0.85);
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
  if (type === "zoom") {
    viewer.zoom(value === 1 ? 1.2 : 0.8);
    viewer.render();
  }
  if (type === "chain" && typeof value === "string") {
    viewer.zoomTo(value === "all" ? {} : { chain: value });
    viewer.render();
  }
});
notify("ready");
