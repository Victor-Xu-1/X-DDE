import { readArtifactFile } from "./artifact-file";
import { sdfRecordRanges } from "./molecular-record";

export const SDF_ARTIFACT_MAX_BYTES = 25 * 1024 ** 2;

/** Match an immutable declared output by bytes, never by a user-editable filename. */
export async function artifactInfo(url: string, signal: AbortSignal) {
  const { bytes, sha256 } = await readArtifactFile(url, signal, {
    maxBytes: SDF_ARTIFACT_MAX_BYTES,
  });

  const text = new TextDecoder().decode(bytes);
  let records = 0;
  for (const { start, contentEnd } of sdfRecordRanges(text)) {
    if (
      ++records > 10000 ||
      !/^M  END[ \t]*\r?$/m.test(text.slice(start, contentEnd))
    )
      throw new Error(
        "The molecular result does not contain valid SDF records.",
      );
  }
  if (!records)
    throw new Error("The molecular result does not contain valid SDF records.");
  return { sha256, records };
}
