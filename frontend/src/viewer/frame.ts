import * as mol from "3dmol";
import { MolecularScene } from "./scene";
import { validSource } from "./protocol";
import "./frame.css";
const viewer = mol.createViewer(document.getElementById("molecule")!, {
  backgroundColor: "#ffffff",
  antialias: true,
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
async function load(urls: string[]) {
  controller?.abort();
  controller = new AbortController();
  const request = controller,
    current = ++generation;
  scene.resetState();
  notify("loading");
  viewer.clear();
  try {
    for (const [index, raw] of urls.slice(0, 3).entries()) {
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
      const format =
        response.headers.get("X-Structure-Format") === "pdb" ||
        source.searchParams.get("name")?.toLowerCase().endsWith(".pdb")
          ? "pdb"
          : "cif";
      const model = viewer.addModel(text, format);
      if (!model.selectedAtoms({}).length)
        throw new Error("No atoms were found in the structure");
      if (urls.length > 1)
        model.setStyle(
          {},
          {
            cartoon: { color: ["#478dff", "#ffb266", "#aa84ef"][index] },
            stick: {
              radius: 0.1,
              colorscheme: ["blueCarbon", "orangeCarbon", "purpleCarbon"][
                index
              ],
            },
          },
        );
    }
    scene.inspect(urls.length > 1);
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
  if (type === "load" && Array.isArray(value))
    void load(value.filter((item) => typeof item === "string"));
  if (["options", "selection-action", "residue"].includes(type))
    void command(type, value);
  if (type === "reset") reset();
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
