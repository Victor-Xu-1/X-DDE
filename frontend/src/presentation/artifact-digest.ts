import { readArtifactFile } from "./artifact-file";

/** Match an immutable declared output by bytes, never by a user-editable filename. */
export async function artifactInfo(url: string, signal: AbortSignal) {
  const { bytes, sha256 } = await readArtifactFile(url, signal, {
    maxBytes: 25 * 1024 ** 2,
  });

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
