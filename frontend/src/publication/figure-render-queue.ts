import { renderWithin } from "./render-deadline";
import type { FigureSettings } from "./settings";

export const figureKey = (settings: FigureSettings) => JSON.stringify(settings);
const cancelled = () =>
  new DOMException("Figure settings superseded.", "AbortError");
interface Request {
  key: string;
  settings: FigureSettings;
  signal: AbortSignal;
  resolve(blob: Blob): void;
  reject(error: unknown): void;
}

/** One native capture and at most one latest pending choice; never race a live canvas. */
export class FigureRenderQueue {
  private active: { key: string; work: Promise<Blob> } | null = null;
  private pending: Request | null = null;
  private started = false;
  constructor(
    private render: (settings: FigureSettings) => Promise<Blob>,
    private onStart?: () => void,
  ) {}
  async request(settings: FigureSettings, signal: AbortSignal): Promise<Blob> {
    signal.throwIfAborted();
    const copy = { ...settings },
      key = figureKey(copy);
    if (this.active?.key === key) {
      this.pending?.reject(cancelled());
      this.pending = null;
      return renderWithin(this.active.work, signal);
    }
    this.pending?.reject(cancelled());
    let request!: Request;
    const work = new Promise<Blob>((resolve, reject) => {
      request = { key, settings: copy, signal, resolve, reject };
      this.pending = request;
    });
    const cancel = () => {
      if (this.pending === request) this.pending = null;
      request.reject(cancelled());
    };
    signal.addEventListener("abort", cancel, { once: true });
    this.drain();
    try {
      return await renderWithin(work, signal);
    } finally {
      signal.removeEventListener("abort", cancel);
      if (this.pending === request) {
        this.pending = null;
        request.reject(cancelled());
      }
    }
  }
  private drain() {
    if (this.active || !this.pending) return;
    const request = this.pending;
    this.pending = null;
    if (request.signal.aborted) {
      request.reject(cancelled());
      return;
    }
    const work = Promise.resolve().then(() => {
      if (!this.started) {
        this.started = true;
        this.onStart?.();
      }
      return this.render(request.settings);
    });
    this.active = { key: request.key, work };
    work.then(request.resolve, request.reject);
    const complete = () => {
      this.active = null;
      this.drain();
    };
    // Observe both outcomes. A cancelled waiter never releases a still-running native capture.
    void work.then(complete, complete);
  }
}
