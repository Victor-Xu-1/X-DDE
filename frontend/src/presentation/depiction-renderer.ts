import { editorReady, type Ketcher } from "../editors/scientificEditor";
import { configureKetcherPreview } from "../editors/ketcher-appearance";
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
    !(
      /^\/api\/(assets|jobs)\//.test(source.url) ||
      /^\/api\/datasets\/[0-9a-f-]+\/members\/structure\?/.test(source.url)
    )
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

/** Native drawing pixels in an image URL accepted by the platform's strict CSP. */
export async function depictionDataUrl(blob: Blob): Promise<string> {
  if (blob.type !== "image/svg+xml" || !blob.size || blob.size > 2 * 1024 ** 2)
    throw new Error("Expected a bounded native SVG drawing.");
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const value = reader.result;
      if (
        typeof value !== "string" ||
        !value.startsWith("data:image/svg+xml;base64,")
      )
        reject(new Error("The native drawing could not be read as an image."));
      else resolve(value);
    };
    reader.onerror = () =>
      reject(reader.error ?? new Error("Cannot read the native drawing."));
    reader.readAsDataURL(blob);
  });
}

/** A bounded, local native Ketcher renderer. It never writes back to the editor or source. */
export class DepictionRenderer {
  private controller = new AbortController();
  private cache = new Map<string, Blob>();
  private requests = new Map<
    string,
    { promise: Promise<Blob>; consumers: Set<AbortSignal> }
  >();
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
        const editor = await editorReady(this.frame, signal, 200);
        // Ketcher's image service derives its native carbon/hydrogen label mode
        // from these editor options, keeping images and the visible editor consistent.
        configureKetcherPreview(editor);
        return editor;
      })();
    return this.ready;
  }
  retryInitialization() {
    this.ready = null;
  }
  async render(
    source: DepictionSource,
    signal: AbortSignal,
    bondThickness = 1.6,
  ) {
    if (![1.2, 1.6, 2.2].includes(bondThickness))
      throw new Error("Choose a supported drawing style.");
    signal.throwIfAborted();
    const key = JSON.stringify([source, bondThickness]);
    const cached = this.cache.get(key);
    if (cached) return cached;
    let request = this.requests.get(key);
    if (!request) {
      if (this.pending >= 80)
        throw new Error("Too many structure previews. Select fewer records.");
      this.pending++;
      const consumers = new Set<AbortSignal>();
      const ensureVisible = () => {
        if (![...consumers].some((consumer) => !consumer.aborted))
          throw new DOMException(
            "The structure preview is no longer needed.",
            "AbortError",
          );
      };
      const promise = this.tail
        .then(async () => {
          this.controller.signal.throwIfAborted();
          ensureVisible();
          const editor = await this.initialize();
          ensureVisible();
          const timeout = AbortSignal.timeout(25000);
          const active = AbortSignal.any([timeout, this.controller.signal]);
          const structure = await readStructure(source, active);
          ensureVisible();
          if (!editor.generateImage)
            throw new Error(
              "Update the Ketcher component to draw 2D structures.",
            );
          const drawing = (async () => {
            // This canvas belongs only to the invisible drawing service. Native
            // layout changes a display copy; scientific files and the user's editor stay intact.
            if (!editor.layout)
              throw new Error("Update Ketcher to use native 2D layout.");
            if (!editor.dearomatize)
              throw new Error(
                "Update Ketcher to draw alternating aromatic bonds.",
              );
            await editor.setMolecule(structure);
            await editor.layout();
            // Ketcher assigns a valid Kekulé form to this display copy. Removing
            // circles from an SVG would lose the aromatic bond information.
            await editor.dearomatize();
            const arranged = await editor.getMolfile();
            active.throwIfAborted();
            return editor.generateImage!(arranged, {
              outputFormat: "svg",
              backgroundColor: "1,1,1",
              bondThickness,
            });
          })();
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
      request = { promise, consumers };
      this.requests.set(key, request);
      this.tail = promise.catch(() => undefined);
    }
    const consumers = request.consumers;
    consumers.add(signal);
    const release = () => consumers.delete(signal);
    signal.addEventListener("abort", release, { once: true });
    try {
      const result = await request.promise;
      signal.throwIfAborted();
      return result;
    } finally {
      signal.removeEventListener("abort", release);
      release();
    }
  }
  close() {
    this.controller.abort();
    this.cache.clear();
  }
}
