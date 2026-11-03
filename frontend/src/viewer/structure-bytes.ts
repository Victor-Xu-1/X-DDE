/** Limit streamed bytes, including missing/dishonest Content-Length, before decoding. */
export async function structureBytes(response: Response) {
  const limit = 10_000_000;
  if (
    !response.ok ||
    !response.body ||
    Number(response.headers.get("Content-Length")) > limit
  )
    throw new Error(
      "Structure could not be loaded within the viewer byte limit.",
    );
  const reader = response.body.getReader(),
    chunks: Uint8Array[] = [];
  let count = 0;
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      count += value.length;
      if (count > limit)
        throw new Error("Structure exceeds the viewer byte limit.");
      chunks.push(value);
    }
  } finally {
    await reader.cancel().catch(() => {});
    reader.releaseLock();
  }
  const bytes = new Uint8Array(count);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.length;
  }
  const sha256 = [
    ...new Uint8Array(await crypto.subtle.digest("SHA-256", bytes)),
  ]
    .map((v) => v.toString(16).padStart(2, "0"))
    .join("");
  return { text: new TextDecoder().decode(bytes), sha256 };
}
