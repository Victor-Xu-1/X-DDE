import { useEffect, useRef, useState } from "react";
import { api } from "../api";
import type { Language } from "../types";
import { ComponentLibrary } from "./ComponentLibrary";
import { InstallLocation } from "./InstallLocation";
import { ComputeServicePanel } from "./ComputeServicePanel";
import { DeploymentActivity } from "./DeploymentActivity";
import { linuxLocation, type Deployment } from "./client";
import { installComponents } from "./installation";
import "./deployment.css";
import "./components.css";

export function DeploymentPanel({
  data,
  error,
  refresh,
  language,
}: {
  data: Deployment | null;
  error: string;
  refresh(): void;
  language: Language;
}) {
  const zh = language === "zh";
  const [location, setLocation] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [saved, setSaved] = useState(false);
  const initialized = useRef(false);
  const inFlight = useRef(false);
  useEffect(() => {
    if (data && !initialized.current) {
      initialized.current = true;
      setLocation(
        data.config.root?.replace(/\/(?:x-dde|opendde)-managed$/, "") ||
          data.default_location,
      );
    }
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
    setSaved(true);
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
          <InstallLocation
            data={data}
            zh={zh}
            location={location}
            onChange={(value) => {
              setSaved(false);
              setLocation(value);
            }}
            busy={busy}
            onSave={() => void execute(save)}
          />
          {saved && (
            <p className="field-help" role="status">
              {zh ? "安装目录已确认。" : "Install location confirmed."}
            </p>
          )}
          <ComputeServicePanel
            data={data}
            zh={zh}
            busy={busy}
            execute={execute}
          />
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
        </>
      )}
    </section>
  );
}
