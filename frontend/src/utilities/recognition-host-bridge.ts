/** Checked parent protocol; all model actions delegate to the existing native host. */
const origins = new Set([
  "http://127.0.0.1:4322",
  "http://localhost:4322",
  "http://127.0.0.1:4330",
]);
const uuid = /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i;
export function inputBridgeOrigin() {
  return embeddedOrigin("xdde-input");
}
export function drawingBridgeOrigin() {
  return embeddedOrigin("xdde-drawing");
}
function embeddedOrigin(mode: "xdde-input" | "xdde-drawing") {
  const query = new URLSearchParams(location.search),
    origin = query.get("parent") ?? "";
  return query.get(mode) === "1" &&
    !query.has(mode === "xdde-input" ? "xdde-drawing" : "xdde-input") &&
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
  recognitionReady?(): boolean;
  recognize?(file: File, signal: AbortSignal): Promise<void>;
  loadMolecule?(molecule: {
    smiles: string;
    molfile: string;
  }): Promise<void> | void;
}
type Run = {
  id: string;
  phase: "working" | "ready" | "failed" | "cancelled";
  controller: AbortController;
};
type Context = {
  id: string;
  file: File;
  accepted: boolean;
  bound: boolean;
  run?: Run;
};
function validMolecule(
  value: unknown,
): value is { smiles: string; molfile: string } {
  if (!value || typeof value !== "object") return false;
  const item = value as Record<string, unknown>;
  return (
    typeof item.smiles === "string" &&
    item.smiles.trim().length > 0 &&
    item.smiles.length <= 200000 &&
    typeof item.molfile === "string" &&
    item.molfile.length <= 2 * 1024 ** 2 &&
    /^M  END\s*$/m.test(item.molfile) &&
    !item.molfile.includes("$$$$")
  );
}
export function attachRecognitionBridge(
  host: RecognitionHost,
  origin: string,
  mode: "input" | "drawing" = "input",
) {
  if (!origins.has(origin) || window.parent === window)
    throw new Error("Unsupported embedding origin");
  if (mode === "drawing") return attachDrawingBridge(host, origin);
  let context: Context | null = null;
  let version = 0,
    exporting = false,
    mounted = true;
  const unsubscribe = host.subscribe(() => {
    version++;
  });
  function recognitionReady(context: Context) {
    const ready = host.recognitionReady?.();
    return ready === undefined
      ? undefined
      : ready && context.bound && Boolean(host.file());
  }
  function publish() {
    if (context?.accepted && host.file() === context.file) context.bound = true;
    if (mounted && context)
      window.parent.postMessage(
        {
          type: "xdde-image:state",
          id: context.id,
          valid:
            context.accepted &&
            context.bound &&
            context.run?.phase !== "working" &&
            Boolean(host.file()) &&
            host.available(),
          filename: context.bound
            ? (host.file()?.name ?? context.file.name)
            : context.file.name,
          recognitionSupported: typeof host.recognize === "function",
          recognitionServiceReady: recognitionReady(context),
          recognitionRequestId: context.run?.id,
          recognitionPhase: context.run?.phase,
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
      context?.run?.controller.abort();
      const bound: Context = {
        id: data.id,
        file: data.file as File,
        accepted: false,
        bound: false,
      };
      context = bound;
      version++;
      try {
        bound.accepted = await host.selectFile(bound.file);
        if (!mounted || context !== bound) return;
        if (bound.accepted && data.initialMolecule !== undefined) {
          if (!host.loadMolecule || !validMolecule(data.initialMolecule))
            bound.accepted = false;
          else await host.loadMolecule(data.initialMolecule);
        }
      } catch {
        bound.accepted = false;
      }
      if (mounted && context === bound) publish();
      return;
    }
    const bound = context;
    if (data.type === "xdde-image:cancel") {
      if (
        bound &&
        bound.id === data.id &&
        bound.run &&
        bound.run.id === data.requestId
      ) {
        bound.run.phase = "cancelled";
        bound.run.controller.abort();
      }
      return;
    }
    if (data.type === "xdde-image:recognize") {
      if (!bound || bound.id !== data.id || !uuid.test(data.requestId ?? ""))
        return;
      if (bound.run?.id === data.requestId) {
        publish();
        return;
      }
      if (bound.run?.phase === "working") {
        window.parent.postMessage(
          {
            type: "xdde-image:state",
            id: bound.id,
            valid: false,
            recognitionSupported: Boolean(host.recognize),
            recognitionServiceReady: recognitionReady(bound),
            recognitionRequestId: data.requestId,
            recognitionPhase: "failed",
          },
          origin,
        );
        return;
      }
      const run: Run = {
        id: data.requestId,
        phase: "working",
        controller: new AbortController(),
      };
      bound.run = run;
      publish();
      try {
        const file = bound.bound ? host.file() : null;
        if (!file || !host.recognize)
          throw new Error("Recognition input unavailable");
        if (host.recognitionReady?.() !== true)
          throw new Error("Recognition service is not ready");
        await host.recognize(file, run.controller.signal);
        if (host.file() !== file) throw new Error("Recognition input changed");
        if (
          mounted &&
          context === bound &&
          bound.run === run &&
          !run.controller.signal.aborted
        ) {
          run.phase = "ready";
          publish();
        }
      } catch {
        if (
          mounted &&
          context === bound &&
          bound.run === run &&
          !run.controller.signal.aborted
        ) {
          run.phase = "failed";
          publish();
        }
      }
      return;
    }
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
    const respond = (
      molecule: { smiles: string; molfile: string } | null,
      error?: "timeout",
    ) => {
      if (mounted && context === bound)
        window.parent.postMessage(
          {
            type: "xdde-image:result",
            id: bound.id,
            requestId: data.requestId,
            molecule,
            source,
            error,
          },
          origin,
        );
    };
    if (
      !bound.accepted ||
      !bound.bound ||
      bound.run?.phase === "working" ||
      !source ||
      !host.available()
    ) {
      respond(null);
      return;
    }
    exporting = true;
    try {
      const { molecule, error } = await readMolecule(host);
      respond(
        revision === version && host.file() === source && host.available()
          ? molecule
          : null,
        error,
      );
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
      context?.run?.controller.abort();
      context = null;
      unsubscribe();
      window.removeEventListener("message", receive);
    },
  };
}

/** The embedded drawing workspace exposes a snapshot only on explicit request. */
function attachDrawingBridge(host: RecognitionHost, origin: string) {
  let session: string | null = null;
  let revision = 0;
  let exporting = false;
  let mounted = true;
  function publish() {
    if (mounted && session)
      window.parent.postMessage(
        {
          type: "xdde-drawing:state",
          id: session,
          available: host.available(),
        },
        origin,
      );
  }
  const unsubscribe = host.subscribe(() => {
    revision++;
    publish();
  });
  async function receive(event: MessageEvent) {
    if (event.origin !== origin || event.source !== window.parent) return;
    const data = event.data;
    if (!data || typeof data.id !== "string" || !uuid.test(data.id)) return;
    if (data.type === "xdde-drawing:connect") {
      session = data.id;
      publish();
      return;
    }
    if (
      data.type !== "xdde-drawing:export" ||
      data.id !== session ||
      typeof data.requestId !== "string" ||
      !uuid.test(data.requestId) ||
      exporting
    )
      return;
    const id = session;
    const before = revision;
    exporting = true;
    try {
      const result = host.available()
        ? await readMolecule(host)
        : { molecule: null };
      if (mounted && session === id)
        window.parent.postMessage(
          {
            type: "xdde-drawing:result",
            id,
            requestId: data.requestId,
            molecule:
              before === revision && host.available() ? result.molecule : null,
          },
          origin,
        );
    } finally {
      exporting = false;
    }
  }
  window.addEventListener("message", receive);
  window.parent.postMessage({ type: "xdde-drawing:ready" }, origin);
  return {
    publish,
    dispose() {
      mounted = false;
      unsubscribe();
      window.removeEventListener("message", receive);
    },
  };
}

async function readMolecule(host: RecognitionHost): Promise<{
  molecule: ImageMoleculeSnapshot | null;
  error?: "timeout";
}> {
  let deadline: ReturnType<typeof setTimeout> | undefined;
  let timedOut = false;
  try {
    const value = await Promise.race([
      host.molecule(),
      new Promise<never>((_resolve, reject) => {
        deadline = setTimeout(() => {
          timedOut = true;
          reject(new Error("Native molecular export timed out"));
        }, 12000);
      }),
    ]);
    return { molecule: validMolecule(value) ? value : null };
  } catch {
    return { molecule: null, error: timedOut ? "timeout" : undefined };
  } finally {
    clearTimeout(deadline);
  }
}

type ImageMoleculeSnapshot = { smiles: string; molfile: string };
