import { useEffect, useState } from "react";
import { api, request } from "../api";
import type { Job, Language } from "../types";
import type { ExampleInfo, PreparedExample } from "./types";
import "./examples.css";

export function ExampleActions({
  capability,
  language,
  onLoad,
  onResult,
}: {
  capability: string;
  language: Language;
  onLoad(value: PreparedExample): void;
  onResult(job: Job): void;
}) {
  const zh = language === "zh";
  const [info, setInfo] = useState<ExampleInfo | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    const controller = new AbortController();
    setInfo(null);
    setError("");
    void request<ExampleInfo>(`/examples/${capability}`, {
      signal: controller.signal,
    })
      .then((value) => {
        if (!controller.signal.aborted) setInfo(value);
      })
      .catch((failure) => {
        if (!controller.signal.aborted) setError(String(failure));
      });
    return () => controller.abort();
  }, [capability]);

  async function act(action: () => Promise<void>) {
    setBusy(true);
    setError("");
    try {
      await action();
    } catch (failure) {
      setError(String(failure));
    } finally {
      setBusy(false);
    }
  }
  return (
    <aside
      className="example-actions"
      aria-label={zh ? "固定研发案例" : "Fixed research example"}
    >
      {info && (
        <>
          <span title={info.case.description[zh ? 0 : 1]}>
            {zh ? "案例：" : "Example: "}
            {info.case.label[zh ? 0 : 1]}
          </span>
          <button
            className="secondary-button"
            disabled={busy}
            onClick={() =>
              void act(async () => {
                const prepared = await api.post<PreparedExample>(
                  `/examples/${capability}/prepare`,
                  {},
                );
                onLoad(prepared);
              })
            }
          >
            {busy
              ? zh
                ? "正在准备…"
                : "Preparing…"
              : zh
                ? "加载案例"
                : "Load example"}
          </button>
          {(info.pin || info.record_pin) && (
            <button
              className="secondary-button"
              disabled={busy}
              onClick={() =>
                void act(async () => {
                  if (info.pin) {
                    const job = await request<Job>(`/jobs/${info.pin.job_id}`);
                    onResult(job);
                  } else {
                    const prepared = await api.post<PreparedExample>(
                      `/examples/${capability}/prepare`,
                      {},
                    );
                    onLoad({ ...prepared, result_requested: true });
                  }
                })
              }
            >
              {info.record_pin && !info.record_pin.computed_result_available
                ? zh
                  ? "查看配置示例"
                  : "View validated setup"
                : zh
                  ? "查看真实结果"
                  : "View real results"}
            </button>
          )}
          <details>
            <summary>{zh ? "来源" : "Sources"}</summary>
            <ul>
              {info.case.sources.map((url) => (
                <li key={url}>
                  <a href={url} target="_blank" rel="noreferrer">
                    {new URL(url).hostname}
                  </a>
                </li>
              ))}
            </ul>
            <small>
              {[...new Set(info.files.map((file) => file.license))].join(" · ")}
            </small>
          </details>
        </>
      )}
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
    </aside>
  );
}
