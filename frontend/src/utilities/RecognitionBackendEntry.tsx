import { useEffect, useState } from "react";
import { request } from "../api";
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
  power?: { phase: keyof typeof phaseLabels; enabled: boolean };
};

export function useRecognitionStatus(observe: boolean) {
  const [status, setStatus] = useState<RecognitionStatus | null>(null);
  useEffect(() => {
    if (!observe) return;
    const controller = new AbortController();
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
    };
  }, [observe]);
  return observe ? status : null;
}

export function RecognitionBackendEntry({
  language,
  status,
  onOpen,
}: {
  language: Language;
  status: RecognitionStatus | null;
  onOpen(): void;
}) {
  const zh = language === "zh";
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
    <div
      className="runtime-switch recognition-backend-entry"
      data-engine="decimer"
    >
      <span className="runtime-switch-label">
        <span>DECIMER</span>
        <span className="runtime-switch-status">
          <small aria-live="polite">{description}</small>
        </span>
      </span>
      <button type="button" className="secondary-button" onClick={onOpen}>
        {zh ? "打开识别工作台" : "Open image workbench"}
      </button>
    </div>
  );
}
