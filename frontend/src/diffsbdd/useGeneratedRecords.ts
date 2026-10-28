import { useEffect, useRef, useState } from "react";
import { api, artifactUrl, request } from "../api";
import { artifactInfo } from "../presentation/artifact-digest";
import { readArtifactFile } from "../presentation/artifact-file";
import type { OperationResult } from "../operations/types";
import type { MoleculeRef, ScientificObject } from "../research/types";
import type { GeneratedRecord } from "./GeneratedCandidates";

class SourceMismatch extends Error {}
interface RecordState {
  key: string;
  records: GeneratedRecord[];
  record: number | null;
  error: string;
  preparing: boolean;
  receptor: MoleculeRef | null;
}
interface SourceHandle {
  key: string;
  controller: AbortController;
  read(): Promise<{ records: GeneratedRecord[]; receptor: MoleculeRef | null }>;
}

/** Verified native records and the existing idempotent material-registration authority. */
export function useGeneratedRecords(
  job: string,
  file: string | null,
  data: OperationResult,
  inputReceptor: MoleculeRef | null,
) {
  const receptorFile =
    typeof data.protein_artifact === "string" ? data.protein_artifact : null;
  const key = JSON.stringify([
    job,
    file,
    data.valid,
    data.core_verification,
    receptorFile,
    inputReceptor,
  ]);
  const blank = (sourceKey: string): RecordState => ({
    key: sourceKey,
    records: [],
    record: null,
    error: "",
    preparing: false,
    receptor: null,
  });
  const [state, setState] = useState<RecordState>(() => blank(key));
  const active = useRef<SourceHandle | null>(null);
  const pending = useRef<SourceHandle | null>(null);
  const visible = state.key === key ? state : blank(key);
  useEffect(() => {
    const controller = new AbortController();
    let expected = "";
    let expectedReceptor = "";
    const handle: SourceHandle = {
      key,
      controller,
      async read() {
        if (!file || data.valid === 0) return { records: [], receptor: null };
        const signal = AbortSignal.any([
          controller.signal,
          AbortSignal.timeout(30000),
        ]);
        const info = await artifactInfo(artifactUrl(job, file), signal);
        if (
          (expected && expected !== info.sha256) ||
          (typeof data.valid === "number" && data.valid !== info.records)
        )
          throw new SourceMismatch(
            "The declared candidate count or original molecular file changed.",
          );
        if (
          data.core_verification &&
          (info.sha256 !== data.core_verification.qualified_sha256 ||
            info.records !== data.core_verification.qualified_count)
        )
          throw new SourceMismatch(
            "The qualified molecular result does not match its scientific checks.",
          );
        expected = info.sha256;
        let receptorHash = "";
        if (receptorFile) {
          try {
            receptorHash = (
              await readArtifactFile(artifactUrl(job, receptorFile), signal, {
                maxBytes: 25 * 1024 ** 2,
              })
            ).sha256;
            if (expectedReceptor && expectedReceptor !== receptorHash)
              throw new SourceMismatch("The original receptor file changed.");
            expectedReceptor = receptorHash;
          } catch (error) {
            if (signal.aborted || error instanceof SourceMismatch) throw error;
          }
        }
        const objects: ScientificObject[] = [];
        for (let offset = 0; offset < 10000; offset += 200) {
          const page = await request<ScientificObject[]>(
            `/research/objects?source_job=${encodeURIComponent(job)}&limit=200&offset=${offset}`,
            { signal },
          );
          objects.push(...page.filter((value) => value.source_job === job));
          if (page.length < 200) break;
        }
        signal.throwIfAborted();
        const records = Array.from({ length: info.records }, (_, record) => ({
          record,
          object: objects.find(
            (value) =>
              value.kind === "molecule" &&
              value.reference.sha256 === info.sha256 &&
              value.reference.record === record &&
              value.reference.conformer === 0,
          ),
        }));
        const outputReceptor = receptorHash
          ? objects.find(
              (value) =>
                value.kind === "structure" &&
                value.reference.sha256 === receptorHash &&
                value.reference.record === 0 &&
                value.reference.conformer === 0,
            )?.reference
          : undefined;
        const matchingInput =
          inputReceptor &&
          receptorHash &&
          inputReceptor.sha256 === receptorHash &&
          inputReceptor.record === 0 &&
          inputReceptor.conformer === 0
            ? inputReceptor
            : null;
        return { records, receptor: matchingInput ?? outputReceptor ?? null };
      },
    };
    active.current = handle;
    setState(blank(key));
    void handle
      .read()
      .then(({ records, receptor }) => {
        if (!controller.signal.aborted)
          setState({
            ...blank(key),
            records,
            receptor,
            record: records[0]?.record ?? null,
          });
      })
      .catch((error) => {
        if (!controller.signal.aborted)
          setState({ ...blank(key), error: String(error) });
      });
    return () => {
      controller.abort();
      if (active.current === handle) active.current = null;
    };
  }, [key]);
  async function prepare() {
    const handle = active.current;
    if (!handle || handle.key !== key || pending.current === handle) return;
    const record = visible.record;
    if (record === null) return;
    pending.current = handle;
    setState((value) =>
      value.key === key ? { ...value, preparing: true, error: "" } : value,
    );
    try {
      await api.post(`/jobs/${encodeURIComponent(job)}/index-assets`, {});
      if (active.current !== handle || handle.controller.signal.aborted) return;
      const { records, receptor } = await handle.read();
      if (!records.find((value) => value.record === record)?.object)
        throw new Error(
          "The selected candidate is not available as a research input.",
        );
      if (active.current === handle && !handle.controller.signal.aborted)
        setState((value) =>
          value.key === key
            ? { ...value, records, receptor, preparing: false, error: "" }
            : value,
        );
    } catch (error) {
      if (active.current === handle && !handle.controller.signal.aborted)
        setState((value) =>
          value.key !== key
            ? value
            : error instanceof SourceMismatch
              ? { ...blank(key), error: String(error) }
              : { ...value, preparing: false, error: "prepare" },
        );
    } finally {
      if (pending.current === handle) pending.current = null;
    }
  }
  return {
    records: visible.records,
    receptor: visible.receptor,
    selected:
      visible.records.find((value) => value.record === visible.record) ?? null,
    error: visible.error,
    preparing: visible.preparing,
    prepare,
    select(value: GeneratedRecord) {
      setState((current) =>
        current.key === key ? { ...current, record: value.record } : current,
      );
    },
  };
}
