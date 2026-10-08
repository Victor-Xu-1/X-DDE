/** Bounded, same-origin coordinate loading. Display never edits scientific files. */
const MAX_BYTES = 64 * 1024 * 1024;

export async function readStructure(
  url: string,
  signal: AbortSignal,
): Promise<string> {
  const resolved = new URL(url, window.location.origin);
  if (
    resolved.origin !== window.location.origin ||
    !resolved.pathname.startsWith("/api/")
  )
    throw new Error("Structure must come from a managed X-DDE research file.");
  const response = await fetch(resolved, {
    signal,
    credentials: "same-origin",
  });
  if (!response.ok)
    throw new Error(`Structure download failed (${response.status}).`);
  const reader = response.body?.getReader();
  if (!reader) throw new Error("Structure download has no readable content.");
  const decoder = new TextDecoder();
  let bytes = 0,
    text = "";
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      bytes += value.byteLength;
      if (bytes > MAX_BYTES)
        throw new Error("Interactive structure exceeds the 64 MiB view limit.");
      text += decoder.decode(value, { stream: true });
    }
    return text + decoder.decode();
  } finally {
    await reader.cancel();
    reader.releaseLock();
  }
}

export function frameIdentity(frame: string): string {
  const atoms = frame
    .split(/\r?\n/)
    .filter((line) => /^(ATOM  |HETATM)/.test(line));
  if (!atoms.length || atoms.length > 30000)
    throw new Error("Sampled frame has an unsupported atom count.");
  return (
    atoms.map((line) => line.slice(0, 30) + line.slice(76, 78)).join("\n") +
    "\n" +
    frame
      .split(/\r?\n/)
      .filter((line) => line.startsWith("CONECT"))
      .join("\n")
  );
}
