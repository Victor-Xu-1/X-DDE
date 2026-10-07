import { useEffect, useState } from "react";
import { request } from "../api";
import { ExampleJobResult } from "../examples/ExampleJobResult";
import type { Job, Language } from "../types";
export function ClusterExample({ language }: { language: Language }) {
  const zh = language === "zh",
    [job, setJob] = useState<Job | null>(null),
    [error, setError] = useState(""),
    [loading, setLoading] = useState(true);
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError("");
    void request<{
      computed_result_available: boolean;
      pin: { job_id: string } | null;
    }>("/examples/pose.cluster", { signal: controller.signal })
      .then(async (value) => {
        if (value.computed_result_available && value.pin) {
          const source = await request<Job>("/jobs/" + value.pin.job_id, {
            signal: controller.signal,
          });
          if (!controller.signal.aborted) setJob(source);
        }
      })
      .catch((e) => {
        if (!controller.signal.aborted) setError(String(e));
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, []);
  if (loading)
    return (
      <p role="status">
        {zh ? "正在读取固定分群案例…" : "Loading the fixed clustering case…"}
      </p>
    );
  if (error)
    return (
      <p role="alert">
        {zh
          ? "暂时无法读取案例，请检查公开研究案例组件。"
          : "The example is unavailable. Check the public research case component."}
      </p>
    );
  if (!job)
    return (
      <p>
        {zh
          ? "请在安装与运行中安装公开分群案例。"
          : "Install the public clustering case in Installation & runtime."}
      </p>
    );
  return (
    <section
      aria-label={
        zh ? "BRD4–JQ1 固定分群案例" : "Fixed BRD4–JQ1 clustering case"
      }
    >
      <ExampleJobResult job={job} language={language} />
    </section>
  );
}
