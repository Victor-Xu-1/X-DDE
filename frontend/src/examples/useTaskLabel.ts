import { useEffect, useState } from "react";
import { request } from "../api";
import type { Job, Language } from "../types";
import type { ExampleInfo } from "./types";
/** Only registered public examples use a curated case title; user-authored task names remain untouched. */
export function useTaskLabel(job: Job | null, language: Language) {
  const [label, setLabel] = useState<{
    id: string;
    value: [string, string];
  } | null>(null);
  useEffect(() => {
    const controller = new AbortController();
    setLabel(null);
    if (job)
      void request<{ examples: ExampleInfo[] }>("/examples", {
        signal: controller.signal,
      })
        .then((data) => {
          const info = data.examples?.find((e) => e.pin?.job_id === job.id);
          if (info && !controller.signal.aborted)
            setLabel({ id: job.id, value: info.case.label });
        })
        .catch(() => {
          /* Optional public catalogue enrichment does not replace the authoritative task name. */
        });
    return () => controller.abort();
  }, [job?.id]);
  return label?.id === job?.id
    ? label!.value[language === "zh" ? 0 : 1]
    : (job?.request.name ?? "");
}
