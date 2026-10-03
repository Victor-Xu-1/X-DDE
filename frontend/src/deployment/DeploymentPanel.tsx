import { useEffect, useRef, useState } from "react";
import { api } from "../api";
import type { Language } from "../types";
import { ComponentLibrary } from "./ComponentLibrary";
import { ComponentSettings } from "./ComponentSettings";
import { DeploymentActivity } from "./DeploymentActivity";
import { TerminalCommands } from "./TerminalCommands";
import { linuxLocation, type Deployment } from "./client";
import { installComponents } from "./installation";
import "./deployment.css";
import "./components.css";

export function DeploymentPanel({
  data,
  error,
  refresh,
  language,
  onEditors,
}: {
  data: Deployment | null;
  error: string;
  refresh(): void;
  language: Language;
  onEditors(): void;
}) {
  const zh = language === "zh";
  const [location, setLocation] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const inFlight = useRef(false);
  useEffect(() => {
    if (data)
      setLocation(
        (previous) =>
          previous ||
          data.config.root?.replace(/\/(?:x-dde|opendde)-managed$/, "") ||
          data.default_location,
      );
  }, [data]);
  async function execute(action: () => Promise<unknown>) {
    if (inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    setMessage("");
    try {
      await action();
    } catch (e) {
      setMessage(String(e));
    } finally {
      refresh();
      inFlight.current = false;
      setBusy(false);
    }
  }
  async function save() {
    await api.post("/deployment/config", {
      location: linuxLocation(location),
      automatic: true,
    });
  }
  return (
    <section className="deployment-workspace">
      <h1 className="sr-only">
        {zh ? "X-DDE 集成环境管理" : "X-DDE integrated environments"}
      </h1>
      {(message || error) && (
        <p className="error" role="alert">
          {message || error}
          {error && (
            <button className="secondary-button" onClick={refresh}>
              {zh ? "重试" : "Retry"}
            </button>
          )}
        </p>
      )}
      {!data ? (
        <p role="status">
          {error
            ? zh
              ? "安装状态暂不可用。"
              : "Installation state is unavailable."
            : zh
              ? "正在读取安装状态…"
              : "Loading installation state…"}
        </p>
      ) : (
        <>
          <ComponentSettings
            data={data}
            zh={zh}
            location={location}
            setLocation={setLocation}
            busy={busy}
            execute={execute}
            save={save}
            onEditors={onEditors}
          />
          {data.restart_required && (
            <p className="notice">
              {zh
                ? "组件已变更；空闲时执行 xdde restart 应用配置。安装状态与计算就绪状态分别显示。"
                : "Components changed. Run xdde restart when idle to apply configuration; installation and compute readiness are separate."}
            </p>
          )}
          <ComponentLibrary
            data={data}
            zh={zh}
            busy={busy}
            execute={execute}
            install={(keys, repair) =>
              installComponents(keys, location, zh, repair)
            }
          />
          <DeploymentActivity
            data={data}
            zh={zh}
            busy={busy}
            execute={execute}
          />
          <TerminalCommands zh={zh} />
        </>
      )}
    </section>
  );
}
