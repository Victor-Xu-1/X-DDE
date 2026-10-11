import { taskAvailability } from "./task-availability";

interface Snapshot {
  readonly ready: boolean | undefined;
  readonly error: string;
}
const checking: Snapshot = { ready: undefined, error: "" };

/** One bounded API observation shared by the currently mounted controls. */
class TaskReadinessState {
  private snapshot: Snapshot = checking;
  private controller: AbortController | null = null;
  private listeners = new Set<() => void>();

  constructor(private readonly capability: string) {}

  getSnapshot = () => this.snapshot;

  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    if (this.listeners.size === 1) this.recheck();
    return () => {
      this.listeners.delete(listener);
      if (!this.listeners.size) {
        this.controller?.abort();
        this.controller = null;
        this.snapshot = checking;
      }
    };
  };

  private publish(value: Snapshot) {
    this.snapshot = value;
    for (const listener of this.listeners) listener();
  }

  recheck = () => {
    if (!this.listeners.size) return;
    this.controller?.abort();
    const controller = new AbortController();
    this.controller = controller;
    this.publish(checking);
    void taskAvailability(this.capability, controller.signal)
      .then((ready) => {
        if (this.controller === controller && !controller.signal.aborted)
          this.publish({ ready, error: "" });
      })
      .catch(() => {
        if (this.controller === controller && !controller.signal.aborted)
          this.publish({
            ready: false,
            error: "The calculation environment could not be checked.",
          });
      });
  };
}

const states = new Map<string, TaskReadinessState>();
export function taskReadinessState(capability: string) {
  let state = states.get(capability);
  if (!state) {
    state = new TaskReadinessState(capability);
    states.set(capability, state);
  }
  return state;
}
