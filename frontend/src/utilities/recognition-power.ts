import { useSyncExternalStore } from "react";
import { api, request } from "../api";

export const recognitionPhases = {
  stopped: ["已关闭", "Off"],
  starting: ["正在启动…", "Starting…"],
  loading: ["正在加载模型…", "Loading model…"],
  ready: ["已开启", "On"],
  busy: ["正在识别…", "Recognizing…"],
  stopping: ["正在关闭…", "Stopping…"],
  error: ["识别服务出错", "Recognition service error"],
} as const;

type Phase = keyof typeof recognitionPhases;
type RecognitionStatus = {
  available: boolean;
  idle_power?: boolean;
  power?: { phase: Phase; enabled: boolean };
};

const initial = {
  status: null as RecognitionStatus | null,
  changing: false,
  failed: false,
};
const path = "/utilities/recognition";
export const recognitionPowerBlocked = (phase: Phase) =>
  phase === "busy" || phase === "stopping";

function hasPower(value: RecognitionStatus) {
  return (
    value?.available === true &&
    typeof value.power?.enabled === "boolean" &&
    Object.hasOwn(recognitionPhases, value.power.phase)
  );
}

/** One observer and power command for all X-DDE controls of the local service. */
class RecognitionPower {
  private state = initial;
  private listeners = new Set<() => void>();
  private reader: AbortController | null = null;
  private timer: ReturnType<typeof setTimeout> | undefined;
  private generation = 0;

  getSnapshot = () => this.state;

  private update(value: Partial<typeof initial>) {
    this.state = { ...this.state, ...value };
    for (const listener of this.listeners) listener();
  }

  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    if (this.listeners.size === 1) void this.refresh();
    return () => {
      this.listeners.delete(listener);
      if (this.listeners.size) return;
      this.generation++;
      this.stopReading();
      this.state = { ...initial, changing: this.state.changing };
    };
  };

  private stopReading() {
    this.reader?.abort();
    this.reader = null;
    clearTimeout(this.timer);
  }

  refresh = async (invalidate = false) => {
    if (invalidate) {
      this.generation++;
      this.update({ status: null });
    }
    if (!this.listeners.size || this.state.changing) return;
    this.stopReading();
    const reader = new AbortController();
    this.reader = reader;
    try {
      const next = await request<RecognitionStatus>(
        `${path}?include_power=true`,
        {
          signal: AbortSignal.any([reader.signal, AbortSignal.timeout(6000)]),
        },
      );
      if (reader.signal.aborted) return;
      this.update({
        status: hasPower(next)
          ? next
          : next && { available: next.available, idle_power: next.idle_power },
      });
    } catch {
      if (!reader.signal.aborted) this.update({ status: null });
    } finally {
      if (this.reader === reader) {
        this.reader = null;
        this.timer = setTimeout(this.refresh, 5000);
      }
    }
  };

  toggle = async () => {
    const { status, changing } = this.state;
    const power = status?.power;
    if (
      !status?.idle_power ||
      !power ||
      changing ||
      recognitionPowerBlocked(power.phase)
    )
      return;
    const generation = this.generation;
    this.stopReading();
    this.update({ changing: true, failed: false });
    try {
      const next = await api.post<RecognitionStatus>(
        `${path}/${power.enabled ? "stop" : "start"}`,
        {},
      );
      if (
        !hasPower(next) ||
        next.idle_power !== true ||
        next.power?.enabled !== !power.enabled
      )
        throw new Error("Invalid recognition power response");
      if (generation === this.generation) this.update({ status: next });
    } catch {
      if (generation === this.generation)
        this.update({ status: null, failed: true });
    } finally {
      this.update({ changing: false });
      void this.refresh();
    }
  };
}

const controls = new RecognitionPower();
const inactive = () => initial;
const unsubscribe = () => () => undefined;

export function useRecognitionStatus(observe: boolean) {
  return {
    ...useSyncExternalStore(
      observe ? controls.subscribe : unsubscribe,
      observe ? controls.getSnapshot : inactive,
    ),
    toggle: controls.toggle,
    refresh: controls.refresh,
  };
}
