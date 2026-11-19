import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { api, request } from "../api";
import { BackendPowerSwitch } from "./BackendPowerSwitch";
import type { Language } from "../types";

const phaseLabels = {
  stopped: ["已关闭", "Off"],
  starting: ["正在启动…", "Starting…"],
  loading: ["正在加载模型…", "Loading model…"],
  ready: ["已开启", "On"],
  busy: ["正在识别…", "Recognizing…"],
  stopping: ["正在关闭…", "Stopping…"],
  error: ["识别服务出错", "Recognition service error"],
} as const;

type RecognitionStatus = {
  available: boolean;
  idle_power?: boolean;
  power?: { phase: keyof typeof phaseLabels; enabled: boolean };
};

export function useRecognitionStatus(observe: boolean) {
  const [status, setStatus] = useState<RecognitionStatus | null>(null);
  const [changing, setChanging] = useState(false);
  const [failed, setFailed] = useState(false);
  const pending = useRef(false);
  const reading = useRef<AbortController | null>(null);
  useLayoutEffect(() => {
    if (!observe) setStatus(null);
  }, [observe]);
  useEffect(() => {
    if (!observe || changing) return;
    const controller = new AbortController();
    reading.current = controller;
    let timer: ReturnType<typeof setTimeout>;
    async function read() {
      try {
        const value = await request<RecognitionStatus>(
          "/utilities/recognition?include_power=true",
          {
            signal: AbortSignal.any([
              controller.signal,
              AbortSignal.timeout(6000),
            ]),
          },
        );
        if (!controller.signal.aborted) setStatus(value);
      } catch {
        if (!controller.signal.aborted) setStatus(null);
      } finally {
        if (!controller.signal.aborted) timer = setTimeout(read, 5000);
      }
    }
    void read();
    return () => {
      controller.abort();
      clearTimeout(timer);
      reading.current = null;
    };
  }, [observe, changing]);

  async function toggle() {
    const power = status?.power;
    if (
      !observe ||
      !status?.idle_power ||
      !power ||
      pending.current ||
      blocked(power.phase)
    )
      return;
    pending.current = true;
    reading.current?.abort();
    setChanging(true);
    setFailed(false);
    try {
      const next = await api.post<RecognitionStatus>(
        `/utilities/recognition/${power.enabled ? "stop" : "start"}`,
        {},
      );
      if (
        !next.available ||
        next.idle_power !== true ||
        !next.power ||
        next.power.enabled !== !power.enabled ||
        !Object.hasOwn(phaseLabels, next.power.phase)
      )
        throw new Error("Invalid recognition power response");
      setStatus(next);
    } catch {
      setStatus(null);
      setFailed(true);
    } finally {
      pending.current = false;
      setChanging(false);
    }
  }
  return { status: observe ? status : null, changing, failed, toggle };
}

const blocked = (phase: keyof typeof phaseLabels) =>
  phase === "busy" || phase === "stopping";

export function RecognitionBackendEntry({
  language,
  powerControl,
  onOpen,
}: {
  language: Language;
  powerControl: ReturnType<typeof useRecognitionStatus>;
  onOpen(): void;
}) {
  const zh = language === "zh";
  const { status, changing, failed, toggle } = powerControl;
  const phase = status?.power?.phase;
  const description =
    phase && Object.hasOwn(phaseLabels, phase)
      ? phaseLabels[phase][zh ? 0 : 1]
      : status?.available === false
        ? zh
          ? "工作台未连接"
          : "Workbench offline"
        : zh
          ? "状态待确认"
          : "State unavailable";
  return (
    <div className="recognition-backend-entry">
      <BackendPowerSwitch
        id="decimer"
        name="DECIMER"
        status={changing ? (zh ? "正在切换…" : "Switching…") : description}
        enabled={status?.power?.enabled === true}
        disabled={changing || !status?.idle_power || !phase || blocked(phase)}
        onToggle={() => void toggle()}
        setup={
          <button type="button" className="text-button" onClick={onOpen}>
            {zh ? "打开识别工作台" : "Open image workbench"}
          </button>
        }
      />
      {failed && (
        <p className="backend-state-message" role="alert">
          {zh
            ? "未能确认启停结果，正在重新读取识别服务状态。"
            : "Could not confirm the power change. Checking recognition status."}
        </p>
      )}
    </div>
  );
}
