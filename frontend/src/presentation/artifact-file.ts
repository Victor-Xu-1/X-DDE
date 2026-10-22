/** One bounded, cancellable byte reader for immutable local research files. */
export async function readArtifactFile(
  url: string,
  signal: AbortSignal,
  limits: { maxBytes: number; size?: number; sha256?: string },
) {
  if (!/^\/api\/(assets|jobs)\//.test(url))
    throw new Error("Choose a local research output.");
  signal.throwIfAborted();
  const response = await fetch(url, { signal });
  if (
    !response.ok ||
    Number(response.headers.get("content-length")) > limits.maxBytes
  ) {
    void response.body?.cancel().catch(() => {});
    throw new Error(
      "The declared research output is unavailable or too large.",
    );
  }
  const reader = response.body?.getReader();
  if (!reader)
    throw new Error("The declared research output is empty or too large.");
  const chunks: Uint8Array[] = [];
  let length = 0;
  const abort = () => {
    void reader.cancel(signal.reason).catch(() => {});
  };
  signal.addEventListener("abort", abort, { once: true });
  try {
    for (;;) {
      signal.throwIfAborted();
      const { done, value } = await reader.read();
      signal.throwIfAborted();
      if (done) break;
      length += value.byteLength;
      if (length > limits.maxBytes)
        throw new Error("The declared research output is empty or too large.");
      if (value.byteLength) chunks.push(value);
    }
  } catch (error) {
    void reader.cancel(error).catch(() => {});
    throw error;
  } finally {
    signal.removeEventListener("abort", abort);
    reader.releaseLock();
  }
  signal.throwIfAborted();
  if (!length || (limits.size !== undefined && length !== limits.size))
    throw new Error("The declared research output is empty or too large.");
  const bytes = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  const sha256 = Array.from(
    new Uint8Array(await crypto.subtle.digest("SHA-256", bytes)),
    (byte) => byte.toString(16).padStart(2, "0"),
  ).join("");
  signal.throwIfAborted();
  if (limits.sha256 !== undefined && sha256 !== limits.sha256)
    throw new Error("The declared research output bytes changed.");
  return { bytes, sha256 };
}
