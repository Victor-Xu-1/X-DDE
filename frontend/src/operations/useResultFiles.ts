import { useEffect, useState } from "react";
import { api } from "../api";
import type { Artifact } from "../types";
import { isInternalResearchFile } from "../presentation/research-files";

export function compatibleResult(
  file: Artifact,
  formats: readonly string[],
  maxBytes: number,
) {
  return (
    typeof file.name === "string" &&
    Number.isInteger(file.size) &&
    file.size > 0 &&
    file.size <= maxBytes &&
    formats.some((format) => file.name.toLowerCase().endsWith(format)) &&
    !isInternalResearchFile(file.name)
  );
}
/** A late list cannot become the files of another source task. */
export function useResultFiles(
  job: string,
  formats: readonly string[],
  maxBytes: number,
) {
  const key = [job, formats.join(","), maxBytes].join(":");
  const [attempt, setAttempt] = useState(0),
    [state, setState] = useState<{
      key: string;
      files: Artifact[];
      error: boolean;
      loading: boolean;
    }>({ key: "", files: [], error: false, loading: false });
  useEffect(() => {
    const controller = new AbortController();
    if (!job) return;
    const signal = AbortSignal.any([
      controller.signal,
      AbortSignal.timeout(30000),
    ]);
    setState({ key, files: [], error: false, loading: true });
    void api
      .artifacts(job, signal)
      .then((files) => {
        signal.throwIfAborted();
        if (
          !Array.isArray(files) ||
          files.some(
            (file) =>
              !file ||
              typeof file.name !== "string" ||
              !Number.isInteger(file.size) ||
              file.size < 0,
          )
        )
          throw new Error("Invalid result list");
        if (!controller.signal.aborted)
          setState({
            key,
            files: files.filter((file) =>
              compatibleResult(file, formats, maxBytes),
            ),
            error: false,
            loading: false,
          });
      })
      .catch(() => {
        if (!controller.signal.aborted)
          setState({ key, files: [], error: true, loading: false });
      });
    return () => controller.abort();
  }, [key, attempt]);
  return {
    files: job && state.key === key ? state.files : [],
    loading: Boolean(job && (state.key !== key || state.loading)),
    error: Boolean(job && state.key === key && state.error),
    retry: () => setAttempt((value) => value + 1),
  };
}
