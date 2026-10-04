import { editorReady, type Ketcher } from "../editors/scientificEditor";
import { molecularRecordText } from "./molecular-record";
export type DepictionSource =
  { smiles: string } | { url: string; record?: number };

async function readStructure(source: DepictionSource, signal: AbortSignal) {
  if ("smiles" in source) {
    if (!source.smiles.trim() || source.smiles.length > 20000)
      throw new Error("Unsupported molecule size.");
    return source.smiles;
  }
  const record = source.record ?? 0;
  if (
    !Number.isInteger(record) ||
    record < 0 ||
    record > 10000 ||
    !/^\/api\/(assets|jobs)\//.test(source.url)
  )
    throw new Error("Select an exact local molecular record.");
  const response = await fetch(source.url, { signal });
  if (
    !response.ok ||
    Number(response.headers.get("Content-Length")) > 5 * 1024 ** 2
  )
    throw new Error("The original structure is unavailable or exceeds 5 MiB.");
  const format =
    response.headers.get("X-Structure-Format") ??
    new URL(source.url, location.origin).searchParams
      .get("name")
      ?.split(".")
      .at(-1);
  if (format !== "sdf" && format !== "mol")
    throw new Error("2D drawing needs an exact MOL or SDF molecular record.");
  const text = await response.text();
  if (text.length > 5 * 1024 ** 2) throw new Error("5 MiB maximum.");
  return molecularRecordText(text, record, format);
}

/** A bounded, local native Ketcher renderer. It never writes back to the editor or source. */
export class DepictionRenderer {
  private controller = new AbortController();
  private cache = new Map<string, Blob>();
  private requests = new Map<string, Promise<Blob>>();
  private ready: Promise<Ketcher> | null = null;
  private tail: Promise<unknown> = Promise.resolve();
  private pending = 0;
  constructor(private frame: () => HTMLIFrameElement | null) {}
  private initialize() {
    if (!this.ready)
      this.ready = (async () => {
        const signal = AbortSignal.any([
          this.controller.signal,
          AbortSignal.timeout(60000),
        ]);
        const response = await fetch("/api/deployment", { signal });
        if (!response.ok)
          throw new Error("Drawing component status is unavailable.");
        const value = await response.json();
        if (!value.installed?.ketcher)
          throw new Error(
            "Install the Ketcher component to draw 2D structures.",
          );
        return editorReady(this.frame, signal, 200);
      })();
    return this.ready;
  }
  retryInitialization() {
    this.ready = null;
  }
  async render(source: DepictionSource, signal: AbortSignal) {
    signal.throwIfAborted();
    const key = JSON.stringify(source);
    const cached = this.cache.get(key);
    if (cached) return cached;
    let request = this.requests.get(key);
    if (!request) {
      if (this.pending >= 80)
        throw new Error("Too many structure previews. Select fewer records.");
      this.pending++;
      request = this.tail
        .then(async () => {
          this.controller.signal.throwIfAborted();
          const editor = await this.initialize();
          const timeout = AbortSignal.timeout(25000);
          const active = AbortSignal.any([timeout, this.controller.signal]);
          const structure = await readStructure(source, active);
          if (!editor.generateImage)
            throw new Error(
              "Update the Ketcher component to draw 2D structures.",
            );
          const drawing = editor.generateImage(structure, {
            outputFormat: "svg",
            backgroundColor: "1,1,1",
            bondThickness: 1.6,
          });
          const blob = await Promise.race([
            drawing,
            new Promise<never>((_, reject) =>
              active.addEventListener("abort", () => reject(active.reason), {
                once: true,
              }),
            ),
          ]);
          active.throwIfAborted();
          if (!blob || !blob.size || blob.size > 2 * 1024 ** 2)
            throw new Error("The native drawing is empty or too large.");
          const image = new Blob([blob], { type: "image/svg+xml" });
          if (this.cache.size >= 64) {
            const oldest = this.cache.keys().next().value!;
            this.cache.delete(oldest);
          }
          this.cache.set(key, image);
          return image;
        })
        .finally(() => {
          this.pending--;
          this.requests.delete(key);
        });
      this.requests.set(key, request);
      this.tail = request.catch(() => undefined);
    }
    const result = await request;
    signal.throwIfAborted();
    return result;
  }
  close() {
    this.controller.abort();
    this.cache.clear();
  }
}
