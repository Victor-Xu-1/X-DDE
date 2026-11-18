type NativeJob = { id: string; status: string; error?: string | null };
export interface NativeRecognitionWork {
  file: File | null;
  state: { phase: string; job: NativeJob | null };
  busy: boolean;
  error: string;
  smiles: string;
  structureGate: { available: boolean };
  recognize(): Promise<{ id: string } | undefined>;
}
type Pending = {
  file: File;
  signal: AbortSignal;
  resolve(): void;
  reject(error: Error): void;
  remove(): void;
  seenFile: boolean;
  started: boolean;
  jobId: string | null;
};

/** Observe the native workbench lifecycle; never poll, queue or stop another job. */
export function createForegroundRecognition(
  current: () => NativeRecognitionWork,
) {
  let pending: Pending | null = null;
  function finish(item: Pending, error?: Error) {
    if (pending !== item) return;
    pending = null;
    item.remove();
    if (error) item.reject(error);
    else item.resolve();
  }
  function update() {
    const item = pending;
    if (!item) return;
    if (item.signal.aborted) {
      finish(item, new DOMException("Import cancelled", "AbortError"));
      return;
    }
    const work = current();
    if (work.file !== item.file) {
      if (item.seenFile) finish(item, new Error("Recognition input changed"));
      return;
    }
    item.seenFile = true;
    const phase = work.state.phase;
    if (item.started && item.jobId) {
      const job = work.state.job;
      if (job?.id === item.jobId) {
        if (job.status === "failed") {
          finish(item, new Error("Recognition failed"));
          return;
        }
        if (
          job.status === "succeeded" &&
          !work.busy &&
          work.structureGate.available &&
          work.smiles.trim()
        ) {
          finish(item);
          return;
        }
      } else if (job && job.status === "running") {
        finish(item, new Error("Another native job is active"));
        return;
      }
    }
    if (work.error || phase === "error" || phase === "stopping") {
      finish(item, new Error("The native image tool is unavailable"));
      return;
    }
    if (phase === "stopped") {
      finish(item, new Error("Recognition service is off"));
      return;
    }
    if (item.started) return;
    if (work.busy || phase === "busy") {
      finish(item, new Error("Another native job is active"));
      return;
    }
    if (phase !== "ready") return;
    item.started = true;
    void work
      .recognize()
      .then((job) => {
        if (pending !== item || item.signal.aborted) return;
        if (!job) {
          finish(item, new Error("Recognition could not start"));
          return;
        }
        item.jobId = job.id;
        update();
      })
      .catch(() => finish(item, new Error("Recognition could not start")));
  }
  return {
    request(file: File, signal: AbortSignal): Promise<void> {
      if (pending)
        return Promise.reject(new Error("Another import is pending"));
      if (signal.aborted)
        return Promise.reject(
          new DOMException("Import cancelled", "AbortError"),
        );
      return new Promise((resolve, reject) => {
        const item: Pending = {
          file,
          signal,
          resolve,
          reject,
          seenFile: false,
          started: false,
          jobId: null,
          remove: () => signal.removeEventListener("abort", cancel),
        };
        const cancel = () =>
          finish(item, new DOMException("Import cancelled", "AbortError"));
        pending = item;
        signal.addEventListener("abort", cancel, { once: true });
        update();
      });
    },
    update,
    dispose() {
      if (pending)
        finish(pending, new DOMException("Import closed", "AbortError"));
    },
  };
}
