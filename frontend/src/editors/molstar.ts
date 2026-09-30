import "./molstar.css";

declare global {
  interface Window {
    molstar?: {
      Viewer: {
        create(
          element: string,
          options: Record<string, unknown>,
        ): Promise<unknown>;
      };
    };
  }
}
const script = document.createElement("script");
script.src = "/tools/molstar/molstar.js";
script.onerror = () => {
  document.getElementById("molecular-status")!.textContent =
    "Mol* could not load. Check Installation & components / 请检查安装与组件。";
};
script.onload = async () => {
  try {
    if (!window.molstar) throw new Error("Mol* API unavailable");
    await window.molstar.Viewer.create("molecular-root", {
      layoutIsExpanded: false,
      layoutShowControls: true,
      layoutShowSequence: true,
      layoutShowLog: false,
      layoutShowLeftPanel: true,
      collapseLeftPanel: false,
      viewportShowExpand: false,
      pdbProvider: "rcsb",
      volumeStreamingServer: "",
      extensions: [],
    });
    document.getElementById("molecular-status")!.remove();
  } catch (error) {
    document.getElementById("molecular-status")!.textContent = String(error);
  }
};
document.head.append(script);
