import type { Ketcher } from "./scientificEditor";
/** Native Kekulé input display and thin 3D bonds; originals are separate assets. */
export function configureKetcherPreview(editor: Ketcher) {
  if (typeof editor.editor?.setOptions !== "function")
    throw new Error(
      "Ketcher display settings are unavailable. Reload the editor.",
    );
  editor.editor.setOptions(
    JSON.stringify({
      "dearomatize-on-load": true,
      showHydrogenLabels: "Hetero",
      miewMode: "LN",
      miewAtomLabel: "no",
    }),
  );
}
