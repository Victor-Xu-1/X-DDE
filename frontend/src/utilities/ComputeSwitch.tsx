import {
  createContext,
  useContext,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { api } from "../api";
import type { Deployment } from "../deployment/client";
import type { Language } from "../types";
import { BackendPowerSwitch } from "./BackendPowerSwitch";
import type { RuntimeEngine } from "./backend-runtime";

type ComputeService = NonNullable<Deployment["compute_service"]>;
type Action = "start" | "stop";
type Activity = "active" | "unknown" | "idle";

export function computeActivity(
  engine: RuntimeEngine | undefined,
  failed: boolean,
): Activity {
  if (failed || !engine || engine.activity_unknown) return "unknown";
  return engine.active ? "active" : "idle";
}
type ComputePower = {
  service?: ComputeService;
  unavailable: boolean;
  loading: boolean;
  action: Action | null;
  failed: boolean;
  change(): Promise<void>;
};

const ComputeContext = createContext<ComputePower | null>(null);

export function useComputePower() {
  return useContext(ComputeContext);
}
const working = (service: ComputeService) =>
  (service.active ?? 0) + (service.queued ?? 0) > 0;

export function ComputePowerProvider({
  data,
  error,
  refresh,
  children,
}: {
  data: Deployment | null;
  error: string;
  refresh(): void;
  children: ReactNode;
}) {
  const [action, setAction] = useState<Action | null>(null);
  const inFlight = useRef(false);
  const observed = useRef(data);
  useLayoutEffect(() => {
    observed.current = data;
  }, [data]);
  const [failed, setFailed] = useState(false);
  const [confirmed, setConfirmed] = useState<{
    baseline: Deployment | null;
    service: ComputeService;
  }>();
  const service =
    confirmed?.baseline === data ? confirmed.service : data?.compute_service;
  async function change() {
    if (
      inFlight.current ||
      error ||
      !service?.configured ||
      service.cleanup_pending ||
      working(service)
    )
      return;
    inFlight.current = true;
    const next = service.running ? "stop" : "start";
    setAction(next);
    setFailed(false);
    try {
      const result = await api.post<ComputeService>(
        `/deployment/compute/${next}`,
        {},
        undefined,
        120000,
      );
      if (typeof result?.running !== "boolean")
        throw new Error("Invalid compute state");
      // Polling can deliver a newer snapshot while native startup is pending.
      setConfirmed({ baseline: observed.current, service: result });
    } catch {
      setFailed(true);
    } finally {
      refresh();
      inFlight.current = false;
      setAction(null);
    }
  }
  return (
    <ComputeContext.Provider
      value={{
        service,
        unavailable: Boolean(error),
        loading: !data && !error,
        action,
        failed,
        change,
      }}
    >
      {children}
    </ComputeContext.Provider>
  );
}

function computeStatus(power: ComputePower, activity: Activity, zh: boolean) {
  if (power.action === "start") return zh ? "正在启动…" : "Starting…";
  if (power.action === "stop") return zh ? "正在关闭…" : "Stopping…";
  if (power.unavailable) return zh ? "状态待确认" : "State unavailable";
  const { service } = power;
  if (!service) return zh ? "正在读取…" : "Reading service…";
  if (service.cleanup_pending) return zh ? "正在清理…" : "Cleaning up…";
  if (!service.configured)
    return zh ? "已关闭 · 未配置" : "Off · Not configured";
  if (activity === "unknown")
    return zh ? "任务状态待确认" : "Task state unavailable";
  if (activity === "active" || working(service))
    return zh ? "任务进行中" : "Tasks in progress";
  if (!service.running) return zh ? "已关闭" : "Off";
  return service.ready
    ? zh
      ? "已开启"
      : "On"
    : zh
      ? "已开启 · 未就绪"
      : "On · Not ready";
}

export function ComputeSwitch({
  language,
  activity = "idle",
}: {
  language: Language;
  activity?: Activity;
}) {
  const power = useComputePower();
  if (!power) return null;
  const zh = language === "zh";
  const { service } = power;
  return (
    <>
      <BackendPowerSwitch
        id="native-compute"
        name={zh ? "常驻计算服务" : "Persistent compute"}
        status={computeStatus(power, activity, zh)}
        enabled={Boolean(service?.running)}
        pending={power.action !== null}
        disabled={
          power.unavailable ||
          !service?.configured ||
          Boolean(service.cleanup_pending) ||
          activity !== "idle" ||
          working(service)
        }
        hint={
          zh
            ? "关闭后释放服务占用的内存和显存。"
            : "Stopping releases the service’s memory and GPU memory."
        }
        onToggle={() => void power.change()}
      />
      {power.failed && (
        <p className="backend-state-message" role="alert">
          {zh
            ? "切换未完成。请确认没有活动任务后重试。"
            : "Switch failed. Check for active tasks and try again."}
        </p>
      )}
    </>
  );
}
