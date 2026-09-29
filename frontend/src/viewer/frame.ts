import * as mol from "3dmol";
import "./frame.css";

const host = document.getElementById("molecule")!;
const compact = new URLSearchParams(location.search).get("compact") === "1";
const viewer = mol.createViewer(host, {
  backgroundColor: compact ? "#f4f8ff" : "#ecf4ff",
  antialias: true,
});
new ResizeObserver(() => {
  viewer.resize();
  viewer.render();
}).observe(host);
const ligand = {
  hetflag: true,
  not: { or: [{ resn: "HOH" }, { resn: "WAT" }] },
};
let controller: AbortController | null = null;
let surface = true,
  pocket = false;
let generation = 0;
function selectAtom(atom: mol.AtomSpec) {
  if (atom.x == null || atom.y == null || atom.z == null) return;
  viewer.removeAllLabels();
  viewer.addLabel(atom.resn + " " + atom.resi + " · " + atom.atom, {
    position: { x: atom.x, y: atom.y, z: atom.z },
    fontSize: 13,
    backgroundColor: "#18488a",
    backgroundOpacity: 0.9,
  });
  notify("selected", {
    chain: atom.chain ?? "",
    residue: (atom.resn ?? "") + atom.resi,
    atom: atom.atom ?? "",
    element: atom.elem ?? "",
  });
  viewer.render();
}
function notify(type: string, detail: unknown = {}) {
  window.parent.postMessage(
    { channel: "opendde-viewer", type, detail },
    location.origin,
  );
}
async function style() {
  viewer.removeAllSurfaces();
  viewer.setStyle({}, { cartoon: { color: "#b8d0f8" } });
  viewer.setStyle(ligand, {
    stick: { radius: 0.18, colorscheme: "greenCarbon" },
    sphere: { scale: 0.2, colorscheme: "Jmol" },
  });
  const protein = pocket
    ? { hetflag: false, within: { distance: 7, sel: ligand }, byres: true }
    : { hetflag: false };
  if (surface)
    await viewer.addSurface(
      mol.SurfaceType.VDW,
      { opacity: 0.82, color: "#aecbf6" },
      protein,
    );
  if (pocket)
    viewer.addStyle(protein, { stick: { radius: 0.09, colorscheme: "Jmol" } });
  viewer.render();
}
function reset() {
  viewer.zoomTo();
  viewer.zoom(compact ? 1.05 : 0.9);
  viewer.render();
}
async function load(urls: string[]) {
  controller?.abort();
  controller = new AbortController();
  const requestController = controller;
  const current = ++generation;
  notify("loading");
  viewer.clear();
  try {
    for (const [index, raw] of urls.slice(0, 3).entries()) {
      const url = new URL(raw, location.origin);
      if (
        url.origin !== location.origin ||
        !/^\/(api\/jobs\/[0-9a-f-]+\/download|references\/[A-Z0-9]+\.cif)$/.test(
          url.pathname,
        )
      )
        throw new Error("Unsupported structure source");
      const response = await fetch(url, { signal: requestController.signal });
      if (
        !response.ok ||
        Number(response.headers.get("Content-Length")) > 10000000
      )
        throw new Error("Structure could not be loaded");
      const text = await response.text();
      if (text.length > 10000000)
        throw new Error("Structure is too large for the viewer");
      if (current !== generation) return;
      const model = viewer.addModel(text, "cif");
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
    if (urls.length === 1) await style();
    else {
      viewer.removeAllSurfaces();
      viewer.render();
    }
    if (current !== generation) return;
    reset();
    if (!compact)
      viewer.setClickable({}, true, (atom: mol.AtomSpec) => selectAtom(atom));
    notify("loaded", {
      atoms: viewer.selectedAtoms({}).length,
      chains: [...new Set(viewer.selectedAtoms({}).map((atom) => atom.chain))],
    });
  } catch (error) {
    if (!requestController.signal.aborted && current === generation) {
      viewer.clear();
      viewer.render();
      notify("error", String(error));
    }
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
    viewer.clear();
    viewer.render();
  }
  if (type === "load" && Array.isArray(value))
    void load(value.filter((item) => typeof item === "string"));
  if (type === "mode" && ["surface", "cartoon", "pocket"].includes(value)) {
    surface = value !== "cartoon";
    pocket = value === "pocket";
    const current = generation;
    notify("loading");
    void style()
      .then(() => {
        if (current === generation)
          notify("loaded", {
            chains: [
              ...new Set(viewer.selectedAtoms({}).map((atom) => atom.chain)),
            ],
          });
      })
      .catch((error) => {
        if (current === generation) notify("error", String(error));
      });
  }
  if (type === "reset") reset();
  if (type === "zoom") {
    viewer.zoom(value === 1 ? 1.2 : 0.8);
    viewer.render();
  }
  if (type === "chain" && typeof value === "string") {
    viewer.zoomTo(value === "all" ? {} : { chain: value });
    viewer.render();
  }
  if (type === "residue" && typeof value === "string") {
    const match = /^([^:]+):([A-Za-z]{3})(-?\d+)$/.exec(value);
    if (match) {
      const selection = {
        chain: match[1],
        resn: match[2],
        resi: Number(match[3]),
      };
      const atoms = viewer.selectedAtoms(selection);
      if (atoms.length) {
        viewer.zoomTo(selection);
        viewer.zoom(0.65);
        selectAtom(atoms[0]);
      }
    }
  }
});
const reference = new URLSearchParams(location.search).get("reference");
if (reference && ["7RPZ", "5P9J", "6LU7", "7BZ5"].includes(reference)) {
  surface = !compact;
  void load([`/references/${reference}.cif`]);
}
notify("ready");
