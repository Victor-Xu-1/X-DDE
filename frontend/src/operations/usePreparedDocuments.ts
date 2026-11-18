import { useEffect, useState } from "react";
import { artifactUrl } from "../api";
import { readArtifactFile } from "../presentation/artifact-file";
import { preparedEntities, type PreparedEntity } from "./prepared-input-model";

type LoadedDocuments = {
  key: string;
  rows: PreparedEntity[];
  unavailable: boolean;
};

export function usePreparedDocuments(
  jobId: string,
  documents: readonly string[],
  enabled: boolean,
) {
  const [loaded, setLoaded] = useState<LoadedDocuments>();
  const names = JSON.stringify(documents);
  const key = JSON.stringify([jobId, names]);
  const read = enabled && documents.length > 0;
  useEffect(() => {
    if (!read) return;
    const controller = new AbortController();
    const signal = AbortSignal.any([
      controller.signal,
      AbortSignal.timeout(25000),
    ]);
    const files: string[] = JSON.parse(names);
    void Promise.allSettled(
      files.map(async (name) => {
        const { bytes } = await readArtifactFile(
          artifactUrl(jobId, name),
          signal,
          {
            maxBytes: 2 * 1024 ** 2,
          },
        );
        return preparedEntities(
          JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes)),
        );
      }),
    ).then((results) => {
      if (controller.signal.aborted) return;
      setLoaded({
        key,
        rows: results.flatMap((result) =>
          result.status === "fulfilled" ? result.value : [],
        ),
        unavailable: results.some(
          (result) => result.status === "rejected" || !result.value.length,
        ),
      });
    });
    return () => controller.abort();
  }, [read, jobId, key, names]);

  const current = read && loaded?.key === key ? loaded : undefined;
  return {
    rows: current?.rows ?? [],
    loading: read && !current,
    unavailable: current?.unavailable ?? false,
  };
}
