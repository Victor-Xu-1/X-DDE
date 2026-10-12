const MAX_BYTES = 25 * 1024 ** 2;

/** Match an immutable declared output by bytes, never by a user-editable filename. */
export async function artifactInfo(url: string, signal: AbortSignal) {
  if (!/^\/api\/(assets|jobs)\//.test(url))
    throw new Error("Choose a local research output.");
  signal.throwIfAborted();
  const response = await fetch(url, { signal });
  if (
    !response.ok ||
    Number(response.headers.get("content-length")) > MAX_BYTES
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
  // Cancel pending reads promptly, including streams not wired to fetch's signal.
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
      if (length > MAX_BYTES)
        throw new Error("The declared research output is empty or too large.");
      if (value.byteLength) chunks.push(value);
    }
  } catch (error) {
    // Cleanup must not replace the original error or delay rejection.
    void reader.cancel(error).catch(() => {});
    throw error;
  } finally {
    signal.removeEventListener("abort", abort);
    reader.releaseLock();
  }
  signal.throwIfAborted();
  if (!length)
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

  const text = new TextDecoder().decode(bytes);
  const records = text
    .split(/^\$\$\$\$[ \t]*(?:\r?\n|$)/gm)
    .filter((part) => part.trim());
  if (
    !records.length ||
    records.length > 10000 ||
    records.some((part) => !/^M  END[ \t]*\r?$/m.test(part))
  )
    throw new Error("The molecular result does not contain valid SDF records.");
  return { sha256, records: records.length };
}
