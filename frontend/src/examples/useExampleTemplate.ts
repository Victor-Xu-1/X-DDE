import { useEffect, useRef, useState } from "react";
import { api, request } from "../api";
import type { Job, Language } from "../types";
import type { ExampleInfo, PreparedExample } from "./types";
import { reviewedExample } from "./metadata";
export interface ExampleTemplateOptions {
  capability: string;
  language: Language;
  onLoad(value: PreparedExample): void;
  onClear?(): void;
  onPreviewChange?(value: boolean): void;
}
export type ExampleAction = "metadata" | "template" | "result";
export interface ExampleFailure {
  action: ExampleAction;
  reason: string;
}
export function useExampleTemplate({
  capability,
  language,
  onLoad,
  onClear,
  onPreviewChange,
}: ExampleTemplateOptions) {
  const intent = useRef(0);
  const [metadataRevision, setMetadataRevision] = useState(0);
  const [loadingInfo, setLoadingInfo] = useState(true);
  const [pending, setPending] = useState<Exclude<
    ExampleAction,
    "metadata"
  > | null>(null);
  const [failure, setFailure] = useState<ExampleFailure | null>(null);
  const [info, setInfo] = useState<ExampleInfo | null>(null);
  const [loaded, setLoaded] = useState(false),
    [result, setResult] = useState<{
      job?: Job;
      example?: PreparedExample;
    } | null>(null);
  useEffect(() => {
    const controller = new AbortController();
    intent.current++;
    setPending(null);
    setFailure(null);
    setLoadingInfo(true);
    setInfo(null);
    setResult(null);
    setLoaded(false);
    onPreviewChange?.(false);
    void request<ExampleInfo>(`/examples/${capability}`, {
      signal: controller.signal,
    })
      .then((value) => {
        if (!reviewedExample(value, capability))
          throw new Error(
            language === "zh"
              ? "无法读取模板信息。"
              : "Reviewed template metadata is unavailable.",
          );
        if (!controller.signal.aborted) setInfo(value);
      })
      .catch((failure) => {
        if (!controller.signal.aborted) {
          setFailure({ action: "metadata", reason: String(failure) });
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoadingInfo(false);
      });
    return () => {
      intent.current++;
      controller.abort();
    };
  }, [capability, metadataRevision]);
  async function act(
    kind: Exclude<ExampleAction, "metadata">,
    action: (current: () => boolean) => Promise<void>,
  ) {
    const revision = intent.current,
      current = () => revision === intent.current;
    setPending(kind);
    setFailure(null);
    try {
      await action(current);
    } catch (failure) {
      if (current()) {
        setFailure({ action: kind, reason: String(failure) });
      }
    } finally {
      if (current()) setPending(null);
    }
  }
  function closeResult() {
    setResult(null);
    onPreviewChange?.(false);
  }
  const loadTemplate = () =>
    act("template", async (current) => {
      const prepared = await api.post<PreparedExample>(
        `/examples/${capability}/prepare`,
        {},
      );
      if (!current()) return;
      closeResult();
      setLoaded(true);
      onLoad({
        ...prepared,
        template_active: true,
        request: prepared.request
          ? { ...prepared.request, project_id: null }
          : prepared.request,
      });
    });
  const showResult = () =>
    act("result", async (current) => {
      if (!info) return;
      const value = info.pin
        ? { job: await request<Job>(`/jobs/${info.pin.job_id}`) }
        : {
            example: await api.post<PreparedExample>(
              `/examples/${capability}/prepare`,
              {},
            ),
          };
      if (!current()) return;
      setResult(value);
      onPreviewChange?.(true);
    });
  function clear() {
    closeResult();
    setLoaded(false);
    onClear?.();
  }
  function retry() {
    if (failure?.action === "metadata")
      setMetadataRevision((value) => value + 1);
    else if (failure?.action === "template") void loadTemplate();
    else if (failure?.action === "result") void showResult();
  }
  return {
    info,
    loadingInfo,
    pending,
    failure,
    loaded,
    result,
    loadTemplate,
    showResult,
    closeResult,
    clear,
    retry,
  };
}
