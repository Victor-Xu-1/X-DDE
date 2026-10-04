/** Match an immutable declared output by bytes, never by a user-editable filename. */
export async function artifactDigest(url: string, signal: AbortSignal) {
  if (!/^\/api\/(assets|jobs)\//.test(url))
    throw new Error("Choose a local research output.");
  const response = await fetch(url, { signal });
  if (
    !response.ok ||
    Number(response.headers.get("content-length")) > 25 * 1024 ** 2
  )
    throw new Error(
      "The declared research output is unavailable or too large.",
    );
  const bytes = await response.arrayBuffer();
  if (!bytes.byteLength || bytes.byteLength > 25 * 1024 ** 2)
    throw new Error("The declared research output is empty or too large.");
  signal.throwIfAborted();
  return Array.from(
    new Uint8Array(await crypto.subtle.digest("SHA-256", bytes)),
    (byte) => byte.toString(16).padStart(2, "0"),
  ).join("");
}
