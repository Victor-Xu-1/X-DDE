import { useCallback, useSyncExternalStore } from "react";
import { api, request } from "../api";

export type RuntimeEngine = {
  id: string;
  name: string;
  ready: boolean;
  enabled: boolean;
  active: boolean;
  activity_unknown?: boolean;
  operations: string[];
};

export type RuntimeCatalogue = {
  engines: RuntimeEngine[];
  capabilities: Partial<Record<string, string>>;
};

type RuntimeState = {
  catalogue: RuntimeCatalogue | null;
  readError: boolean;
  busy: string;
  failed: string;
};

const initial: RuntimeState = {
  catalogue: null,
  readError: false,
  busy: "",
  failed: "",
};
type Observation = {
  capabilities?: string | readonly string[];
  needsNative: boolean;
};

/** All switches share one observation and serialize explicit permission changes. */
class RuntimeControls {
  private state = initial;
  private listeners = new Map<() => void, Observation>();
  private read: AbortController | null = null;
  private timer: ReturnType<typeof setTimeout> | undefined;

  getSnapshot = () => this.state;

  subscribe = (listener: () => void, observation: Observation) => {
    const observedNative = this.nativeRequested();
    this.listeners.set(listener, observation);
    if (
      this.listeners.size === 1 ||
      (!observedNative && this.nativeRequested())
    )
      void this.refresh();
    return () => {
      this.listeners.delete(listener);
      if (!this.listeners.size) {
        this.stopReading();
        if (!this.state.busy) this.state = initial;
      }
    };
  };

  private update(change: Partial<RuntimeState>) {
    this.state = { ...this.state, ...change };
    for (const listener of this.listeners.keys()) listener();
  }

  private nativeRequested() {
    for (const { capabilities, needsNative } of this.listeners.values()) {
      if (needsNative) return true;
      const selection =
        typeof capabilities === "string" ? [capabilities] : capabilities;
      if (
        selection?.some(
          (id) => this.state.catalogue?.capabilities?.[id] === "harness",
        )
      )
        return true;
    }
    return false;
  }

  private stopReading() {
    this.read?.abort();
    this.read = null;
    clearTimeout(this.timer);
  }

  refresh = async () => {
    if (!this.listeners.size || this.state.busy) return;
    this.stopReading();
    const reader = new AbortController();
    this.read = reader;
    const includeNative = this.nativeRequested();
    const signal = AbortSignal.any([reader.signal, AbortSignal.timeout(22000)]);
    try {
      const path = includeNative
        ? "/runtime-controls"
        : "/runtime-controls?include_native=false";
      const catalogue = await request<RuntimeCatalogue>(path, { signal });
      if (reader.signal.aborted) return;
      if (!Array.isArray(catalogue?.engines))
        throw new Error("Invalid backend status response.");
      this.update({ catalogue, readError: false });
    } catch {
      if (!reader.signal.aborted) this.update({ readError: true });
    } finally {
      if (this.read === reader) {
        this.read = null;
        if (!includeNative && !this.state.readError && this.nativeRequested())
          void this.refresh();
        else this.timer = setTimeout(this.refresh, 5000);
      }
    }
  };

  toggle = async (id: string) => {
    const { catalogue, busy, readError } = this.state;
    const engine = catalogue?.engines.find((item) => item.id === id);
    if (!catalogue || !engine || busy || readError || !canToggle(engine))
      return;
    this.stopReading();
    this.update({ busy: id, failed: "" });
    try {
      const action = engine.enabled ? "stop" : "start";
      const result = await api.post<{ enabled: boolean }>(
        `/runtime-controls/${id}/${action}`,
        {},
      );
      if (typeof result?.enabled !== "boolean")
        throw new Error("Invalid backend switch response.");
      this.update({
        catalogue: {
          ...catalogue,
          engines: catalogue.engines.map((row) =>
            row.id === id ? { ...row, enabled: result.enabled } : row,
          ),
        },
      });
    } catch {
      this.update({ failed: id });
    } finally {
      this.update({ busy: "" });
      if (this.listeners.size) this.refresh();
      else this.state = initial;
    }
  };

  retry = () => {
    this.update({ failed: "" });
    this.refresh();
  };
}

export const canToggle = (item: RuntimeEngine) =>
  !item.active && !item.activity_unknown && (item.ready || item.enabled);

const controls = new RuntimeControls();
export function useBackendRuntime(
  active: boolean,
  capabilities?: string | readonly string[],
  needsNative = false,
) {
  const subscribe = useCallback(
    (listener: () => void) =>
      active
        ? controls.subscribe(listener, { capabilities, needsNative })
        : () => undefined,
    [active, capabilities, needsNative],
  );
  return {
    ...useSyncExternalStore(subscribe, controls.getSnapshot),
    toggle: controls.toggle,
    retry: controls.retry,
  };
}
