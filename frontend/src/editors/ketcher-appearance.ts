import type { Ketcher } from "./scientificEditor";
/** Ketcher's native Lines mode keeps its 3D editor bonds thin; Licorice has a fixed 0.2 radius. */
export function configureKetcherPreview(editor: Ketcher) {
  if (typeof editor.editor?.setOptions !== "function")
    throw new Error(
      "Ketcher display settings are unavailable. Reload the editor.",
    );
  editor.editor.setOptions(
    JSON.stringify({ miewMode: "LN", miewAtomLabel: "no" }),
  );
}
