/** Adapter installed in the existing local recognition host; never owns model lifecycle. */
const origins = new Set([
  "http://127.0.0.1:4322",
  "http://localhost:4322",
  "http://127.0.0.1:4330",
]);
const uuid = /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i;
export function inputBridgeOrigin() {
  const query = new URLSearchParams(location.search),
    origin = query.get("parent") ?? "";
  return query.get("xdde-input") === "1" &&
    window.parent !== window &&
    origins.has(origin)
    ? origin
    : null;
}
export interface RecognitionHost {
  selectFile(file: File): Promise<boolean>;
  file(): File | null;
  available(): boolean;
  molecule(): Promise<{ smiles: string; molfile: string }>;
  subscribe(changed: () => void): () => void;
}
export function attachRecognitionBridge(host: RecognitionHost, origin: string) {
  if (!origins.has(origin) || window.parent === window)
    throw new Error("Unsupported embedding origin");
  let context: { id: string; file: File; accepted: boolean } | null = null;
  let version = 0,
    exporting = false,
    mounted = true;
  const unsubscribe = host.subscribe(() => {
    version++;
  });
  function publish() {
    if (mounted && context)
      window.parent.postMessage(
        {
          type: "xdde-image:state",
          id: context.id,
          valid: context.accepted && Boolean(host.file()) && host.available(),
          filename: host.file()?.name,
        },
        origin,
      );
  }
  async function receive(event: MessageEvent) {
    if (event.origin !== origin || event.source !== window.parent) return;
    const data = event.data;
    if (!data || typeof data !== "object" || !uuid.test(data.id ?? "")) return;
    if (data.type === "xdde-image:connect") {
      if (context?.id === data.id) {
        publish();
        return;
      }
      if (
        !(data.file instanceof File) ||
        data.file.size > 10 * 1024 ** 2 ||
        data.file.size < 1 ||
        !/^image\/(png|jpeg|webp|bmp)$/.test(data.file.type)
      )
        return;
      const bound = { id: data.id, file: data.file as File, accepted: false };
      context = bound;
      version++;
      try {
        bound.accepted = await host.selectFile(bound.file);
      } catch {
        bound.accepted = false;
      }
      if (mounted && context === bound) publish();
      return;
    }
    const bound = context;
    if (
      data.type !== "xdde-image:export" ||
      !bound ||
      data.id !== bound.id ||
      !uuid.test(data.requestId ?? "") ||
      exporting
    )
      return;
    const revision = version;
    const source = host.file();
    const respond = (molecule: { smiles: string; molfile: string } | null) => {
      if (mounted && context === bound)
        window.parent.postMessage(
          {
            type: "xdde-image:result",
            id: bound.id,
            requestId: data.requestId,
            molecule,
            source,
          },
          origin,
        );
    };
    if (!bound.accepted || !source || !host.available()) {
      respond(null);
      return;
    }
    exporting = true;
    try {
      const molecule = await host.molecule();
      respond(
        revision === version && host.file() === source && host.available()
          ? molecule
          : null,
      );
    } catch {
      respond(null);
    } finally {
      exporting = false;
    }
  }
  window.addEventListener("message", receive);
  window.parent.postMessage({ type: "xdde-image:ready" }, origin);
  return {
    publish,
    dispose() {
      mounted = false;
      context = null;
      unsubscribe();
      window.removeEventListener("message", receive);
    },
  };
}
