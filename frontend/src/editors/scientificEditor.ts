import { molecularRecordText } from "../presentation/molecular-record";
import type { ScientificObject } from "../research/types";
export { MoleculeSaveIntent } from "./molecule-save-intent";

export interface Ketcher {
  structService?: {
    layout?(data: {
      struct: string;
      output_format: "chemical/x-indigo-ket";
    }): Promise<{ struct: string }>;
    toggleExplicitHydrogens(data: {
      struct: string;
      mode: "fold";
      output_format: "chemical/x-indigo-ket";
    }): Promise<{ struct: string }>;
  };
  changeEvent?: {
    add(listener: () => void): void;
    remove(listener: () => void): void;
  };
  getKet?(): Promise<string>;
  editor?: { setOptions(options: string): unknown };
  generateImage?(
    data: string,
    options: {
      outputFormat: "svg";
      backgroundColor?: string;
      "render-font-size"?: number;
      "render-font-size-unit"?: "px" | "pt";
      "render-font-size-sub"?: number;
      "render-font-size-sub-unit"?: "px" | "pt";
      "render-bond-thickness"?: number;
      "render-bond-thickness-unit"?: "px" | "pt";
      "bond-length"?: number;
      "bond-length-unit"?: "px" | "pt";
      "image-resolution"?: number;
    },
  ): Promise<Blob>;
  getSmiles(): Promise<string>;
  getMolfile(): Promise<string>;
  setMolecule(value: string): Promise<void>;
  layout?(): Promise<void>;
  dearomatize?(): Promise<void>;
}

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
  const response = await fetch(`/api/assets/${object.reference.asset_id}`, {
    signal,
  });
  if (
    !response.ok ||
    Number(response.headers.get("Content-Length")) > 5 * 1024 ** 2
  )
    throw new Error("Molecule file is unavailable or exceeds 5 MiB.");
  const format = response.headers.get("X-Structure-Format");
  if (format !== "sdf" && format !== "mol")
    throw new Error(
      "Convert this molecule explicitly to MOL or SDF before editing in Ketcher.",
    );
  const text = await response.text();
  if (text.length > 5 * 1024 ** 2) throw new Error("5 MiB maximum");
  return molecularRecordText(text, object.reference.record, format);
}
