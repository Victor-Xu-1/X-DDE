/** Opt-in native UI locale only. Never owns images, editor state or model power. */
export type RecognitionLanguage = "en" | "zh";
const parents = new Set([
  "http://127.0.0.1:4322",
  "http://localhost:4322",
  "http://127.0.0.1:4330",
]);
const uuid = /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i;

export function recognitionLanguage(
  value: unknown,
): RecognitionLanguage | null {
  return value === "en" || value === "zh" ? value : null;
}

export function recognitionFrameUrl(
  origin: string,
  language: RecognitionLanguage,
  mode: boolean | "drawing" = false,
) {
  const url = new URL("/", origin);
  url.searchParams.set("xdde-locale", "1");
  url.searchParams.set("parent", location.origin);
  url.searchParams.set("lang", language);
  if (mode)
    url.searchParams.set(
      mode === "drawing" ? "xdde-drawing" : "xdde-input",
      "1",
    );
  return url.href;
}

/** Called by the recognition host's own React UI, not by a parent DOM patch. */
export function attachRecognitionLocaleHost(
  setLanguage: (language: RecognitionLanguage) => void,
) {
  const query = new URLSearchParams(location.search);
  const origin = query.get("parent") ?? "";
  if (
    window.parent === window ||
    query.get("xdde-locale") !== "1" ||
    !parents.has(origin)
  )
    return () => {};
  function receive(event: MessageEvent) {
    if (event.origin !== origin || event.source !== window.parent) return;
    const data = event.data;
    if (
      !data ||
      data.type !== "xdde-locale:set" ||
      data.version !== 1 ||
      !uuid.test(data.id ?? "")
    )
      return;
    const language = recognitionLanguage(data.language);
    if (!language) return;
    setLanguage(language);
    window.parent.postMessage(
      { type: "xdde-locale:applied", version: 1, id: data.id, language },
      origin,
    );
  }
  window.addEventListener("message", receive);
  window.parent.postMessage({ type: "xdde-locale:ready", version: 1 }, origin);
  return () => window.removeEventListener("message", receive);
}
