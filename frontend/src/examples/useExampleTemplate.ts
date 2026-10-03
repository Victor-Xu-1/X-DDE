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
export function useExampleTemplate({
  capability,
  language,
  onLoad,
  onClear,
  onPreviewChange,
}: ExampleTemplateOptions) {
  const intent = useRef(0);
  const [info, setInfo] = useState<ExampleInfo | null>(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const [loaded, setLoaded] = useState(false),
    [result, setResult] = useState<{
      job?: Job;
      example?: PreparedExample;
    } | null>(null);
  useEffect(() => {
    const controller = new AbortController();
    intent.current++;
    setBusy(false);
    setInfo(null);
    setError("");
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
        if (!controller.signal.aborted) setError(String(failure));
      });
    return () => {
      intent.current++;
      controller.abort();
    };
  }, [capability]);
  async function act(action: (current: () => boolean) => Promise<void>) {
    const revision = intent.current,
      current = () => revision === intent.current;
    setBusy(true);
    setError("");
    try {
      await action(current);
    } catch (failure) {
      if (current()) setError(String(failure));
    } finally {
      if (current()) setBusy(false);
    }
  }
  function closeResult() {
    setResult(null);
    onPreviewChange?.(false);
  }
  const loadTemplate = () =>
    act(async (current) => {
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
    act(async (current) => {
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
  return {
    info,
    busy,
    error,
    loaded,
    result,
    loadTemplate,
    showResult,
    closeResult,
    clear,
  };
}
