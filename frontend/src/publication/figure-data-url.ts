/** Preserve native bytes in an image URL allowed by the platform's existing CSP. */
export async function figureDataUrl(
  blob: Blob,
  signal: AbortSignal,
): Promise<string> {
  signal.throwIfAborted();
  if (
    !["image/png", "image/svg+xml"].includes(blob.type) ||
    !blob.size ||
    blob.size > 64 * 1024 ** 2
  )
    throw new Error("Expected a bounded native figure.");
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    const clean = () => signal.removeEventListener("abort", abort);
    const abort = () => {
      reader.abort();
      clean();
      reject(
        signal.reason ??
          new DOMException("Figure preview closed.", "AbortError"),
      );
    };
    reader.onload = () => {
      clean();
      if (
        typeof reader.result === "string" &&
        reader.result.startsWith("data:" + blob.type + ";base64,")
      )
        resolve(reader.result);
      else reject(new Error("Cannot encode the native figure."));
    };
    reader.onerror = () => {
      clean();
      reject(reader.error ?? new Error("Cannot read the native figure."));
    };
    signal.addEventListener("abort", abort, { once: true });
    reader.readAsDataURL(blob);
  });
}
