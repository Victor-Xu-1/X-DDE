import { useEffect, useState } from "react";
import { artifactUrl } from "../../api";
import { readArtifactFile } from "../artifact-file";
import {
  alignmentByteLimit,
  projectAlignment,
  type AlignmentFile,
  type AlignmentProjection,
} from "./alignment-data";

export function useAlignment(
  jobId: string,
  file: AlignmentFile,
  query: string,
  attempt: number,
) {
  const [state, setState] = useState<{
    data?: AlignmentProjection;
    error?: boolean;
  }>({});
  const signature = JSON.stringify(file);
  useEffect(() => {
    const controller = new AbortController();
    setState({});
    const timer = setTimeout(() => {
      controller.abort();
      setState({ error: true });
    }, 25000);
    void readArtifactFile(
      artifactUrl(jobId, file.artifact),
      controller.signal,
      { maxBytes: alignmentByteLimit, size: file.bytes, sha256: file.sha256 },
    )
      .then(({ bytes }) => {
        controller.signal.throwIfAborted();
        const data = projectAlignment(
          new TextDecoder("utf-8", { fatal: true }).decode(bytes),
          file,
          query,
        );
        if (!controller.signal.aborted) setState({ data });
      })
      .catch(() => {
        if (!controller.signal.aborted) setState({ error: true });
      })
      .finally(() => clearTimeout(timer));
    return () => {
      controller.abort();
      clearTimeout(timer);
    };
  }, [jobId, signature, query, attempt]);
  return state;
}
