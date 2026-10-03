import type { Ketcher } from "./scientificEditor";
/** Miew LC is Ketcher's supported thin-stick representation. */
export function configureKetcherPreview(editor: Ketcher) {
  if (typeof editor.editor?.setOptions !== "function")
    throw new Error(
      "Ketcher display settings are unavailable. Reload the editor.",
    );
  editor.editor.setOptions(
    JSON.stringify({ miewMode: "LC", miewAtomLabel: "no" }),
  );
}
