import { useEffect, useState } from "react";
import { api, request } from "../api";
import type { Language } from "../types";
import type { Deployment } from "../deployment/client";
import { ComputeSwitch } from "./ComputeSwitch";

type Runtime = {
  id: string;
  name: string;
  ready: boolean;
  enabled: boolean;
  active: boolean;
};

export function BackendControls({
  data,
  language,
  refresh,
}: {
  data: Deployment | null;
  language: Language;
  refresh(): void;
}) {
  const zh = language === "zh";
  const [open, setOpen] = useState(false),
    [rows, setRows] = useState<Runtime[]>([]);
  const [error, setError] = useState(""),
    [busy, setBusy] = useState("");
  const [readError, setReadError] = useState("");
  const [revision, setRevision] = useState(0),
    [loading, setLoading] = useState(false);
  useEffect(() => {
    if (!open) return;
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout>;
    async function read() {
      setLoading(true);
      try {
        const result = await request<{ engines: Runtime[] }>(
          "/runtime-controls",
          { signal: controller.signal },
        );
        if (!controller.signal.aborted) {
          setRows(result.engines);
          setReadError("");
        }
      } catch {
        if (!controller.signal.aborted)
          setReadError(
            zh
              ? "无法读取后端状态，请重试。"
              : "Cannot read backend state. Retry.",
          );
      } finally {
        if (!controller.signal.aborted) {
          setLoading(false);
          timer = setTimeout(read, 5000);
        }
      }
    }
    void read();
    return () => {
      controller.abort();
      clearTimeout(timer);
    };
  }, [open, revision, zh]);
  return (
    <div className="backend-controls">
      <button type="button" aria-expanded={open} onClick={() => setOpen(!open)}>
        {zh ? "后端管理" : "Backend controls"}
      </button>
      {open && (
        <section
          className="backend-controls-panel"
          aria-label={zh ? "后端启停" : "Backend power"}
        >
          <header>
            <strong>{zh ? "按需启用" : "Enable on demand"}</strong>
            <button
              type="button"
              aria-label={zh ? "关闭后端面板" : "Close backend panel"}
              onClick={() => setOpen(false)}
            >
              ×
            </button>
          </header>
          <p>
            {zh
              ? "默认关闭。开启后，仅在递交任务时加载；任务结束后释放进程。"
              : "Off by default. Models load only for submitted tasks; task processes exit when finished."}
          </p>
          {(error || readError) && (
            <p role="alert">
              {error || readError}
              <button
                type="button"
                onClick={() => {
                  setError("");
                  setRevision((n) => n + 1);
                }}
              >
                {zh ? "重试" : "Retry"}
              </button>
            </p>
          )}
          {loading && !rows.length && (
            <p role="status">{zh ? "正在读取…" : "Loading…"}</p>
          )}
          <div className="backend-controls-list">
            {rows.map((item) => (
              <div key={item.id} className="compute-switch">
                <span>
                  {item.name}
                  <small>
                    {item.active
                      ? zh
                        ? "任务运行中"
                        : "Task active"
                      : !item.ready
                        ? zh
                          ? "未就绪"
                          : "Not ready"
                        : item.enabled
                          ? zh
                            ? "按需加载"
                            : "On demand"
                          : zh
                            ? "已关闭"
                            : "Off"}
                  </small>
                </span>
                <button
                  type="button"
                  role="switch"
                  aria-label={item.name}
                  aria-checked={item.enabled}
                  disabled={
                    Boolean(busy) ||
                    Boolean(readError) ||
                    (!item.enabled && !item.ready) ||
                    item.active
                  }
                  onClick={async () => {
                    setBusy(item.id);
                    setError("");
                    try {
                      await api.post(
                        `/runtime-controls/${item.id}/${item.enabled ? "stop" : "start"}`,
                        {},
                      );
                      setRows((all) =>
                        all.map((row) =>
                          row.id === item.id
                            ? { ...row, enabled: !item.enabled }
                            : row,
                        ),
                      );
                    } catch {
                      setError(
                        zh
                          ? "切换未完成，请确认没有活动任务后重试。"
                          : "Switch failed. Check active tasks and retry.",
                      );
                    } finally {
                      setBusy("");
                      setRevision((n) => n + 1);
                    }
                  }}
                >
                  <i aria-hidden="true" />
                </button>
              </div>
            ))}
          </div>
          {data?.compute_service?.configured && (
            <footer>
              <span>
                {zh ? "OpenDDE 常驻服务" : "OpenDDE persistent service"}
              </span>
              <ComputeSwitch
                data={data}
                language={language}
                refresh={refresh}
              />
            </footer>
          )}
        </section>
      )}
    </div>
  );
}
