import {
  AssetFileError,
  readAssetFileWithMetadata,
} from "../research/asset-file";
import { molecularRecordText } from "../presentation/molecular-record";
import type { ScientificObject } from "../research/types";
export { MoleculeSaveIntent } from "./molecule-save-intent";

import type { Ketcher } from "./ketcher-contract";
export type { Ketcher } from "./ketcher-contract";

export async function editorReady(
  frame: HTMLIFrameElement | null | (() => HTMLIFrameElement | null),
  signal: AbortSignal,
  attempts = 50,
): Promise<Ketcher> {
  for (let attempt = 0; attempt < Math.min(attempts, 600); attempt++) {
    signal.throwIfAborted();
    const currentFrame = typeof frame === "function" ? frame() : frame;
    const editor = (
      currentFrame?.contentWindow as (Window & { ketcher?: Ketcher }) | null
    )?.ketcher;
    if (editor) return editor;
    await new Promise<void>((resolve, reject) => {
      const abort = () => {
        clearTimeout(timer);
        reject(signal.reason);
      };
      const timer = setTimeout(() => {
        signal.removeEventListener("abort", abort);
        resolve();
      }, 100);
      signal.addEventListener("abort", abort, { once: true });
    });
  }
  throw new Error(
    "Ketcher did not finish loading. Reload the editor and try again.",
  );
}

export async function molecularRecord(
  object: ScientificObject,
  signal: AbortSignal,
) {
  signal.throwIfAborted();
  const controller = new AbortController();
  const abort = () => controller.abort(signal.reason);
  signal.addEventListener("abort", abort, { once: true });
  const timer = setTimeout(
    () =>
      controller.abort(
        new DOMException(
          "Molecule file loading timed out. Reopen the selected version and try again.",
          "TimeoutError",
        ),
      ),
    30_000,
  );
  try {
    const { bytes, suffix } = await readAssetFileWithMetadata(
      object.reference,
      controller.signal,
      { kind: "ligand", suffixes: [".sdf", ".mol"], maxBytes: 5 * 1024 ** 2 },
    );
    return molecularRecordText(
      new TextDecoder().decode(bytes),
      object.reference.record,
      suffix.slice(1),
    );
  } catch (error) {
    // Metadata parsing may wrap a fetch abort; preserve its original reason.
    controller.signal.throwIfAborted();
    if (error instanceof AssetFileError) {
      if (error.code === "format")
        throw new Error(
          "Convert this molecule explicitly to MOL or SDF before editing in Ketcher.",
        );
      if (error.code === "limit")
        throw new Error("Molecule file is unavailable or exceeds 5 MiB.");
      throw new Error(
        "The molecule file does not match the selected version. Choose an intact version and try again.",
      );
    }
    throw error;
  } finally {
    clearTimeout(timer);
    signal.removeEventListener("abort", abort);
  }
}
