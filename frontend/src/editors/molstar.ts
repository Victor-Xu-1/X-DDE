import "./molstar.css";

declare global {
  interface Window {
    molstar?: {
      Viewer: {
        create(
          element: string,
          options: Record<string, unknown>,
        ): Promise<{
          loadStructureFromData(
            data: string,
            format: string,
            options?: { dataLabel: string },
          ): Promise<void>;
          plugin: { clear(): Promise<void> };
        }>;
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
    const viewer = await window.molstar.Viewer.create("molecular-root", {
      layoutIsExpanded: false,
      layoutShowControls: true,
      layoutShowRemoteState: false,
      layoutShowSequence: true,
      layoutShowLog: false,
      layoutShowLeftPanel: false,
      collapseLeftPanel: false,
      viewportShowExpand: false,
      pdbProvider: "rcsb",
      volumeStreamingServer: "",
      volumeStreamingDisabled: true,
      extensions: [],
    });
    document.getElementById("molecular-status")!.remove();
    const input = document.getElementById("structure-file") as HTMLInputElement;
    const status = document.getElementById("molecular-file-status")!;
    input.disabled = false;
    input.addEventListener("change", async () => {
      const file = input.files?.[0];
      if (!file) return;
      input.disabled = true;
      status.textContent = "正在打开 / Opening…";
      try {
        if (
          file.size > 25 * 1024 ** 2 ||
          !/\.(pdb|cif|mmcif)$/i.test(file.name)
        )
          throw new Error(
            "请选择 ≤25 MiB 的 PDB/mmCIF 文件 / Choose a PDB or mmCIF file ≤25 MiB",
          );
        const data = await file.text();
        await viewer.plugin.clear();
        await viewer.loadStructureFromData(
          data,
          /\.pdb$/i.test(file.name) ? "pdb" : "mmcif",
          { dataLabel: file.name },
        );
        status.textContent = file.name;
      } catch (error) {
        status.textContent = String(error);
      } finally {
        input.disabled = false;
        input.value = "";
      }
    });
  } catch (error) {
    document.getElementById("molecular-status")!.textContent = String(error);
  }
};
document.head.append(script);
