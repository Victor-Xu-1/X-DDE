import { renderWithin } from "./render-deadline";
import type { FigureSettings } from "./settings";

/** Length-prefix the existing source so nested contexts do not re-escape large datasets. */
export const figureIdentity = (source: string, ...details: unknown[]) =>
  `${source.length}:${source}${JSON.stringify(details)}`;
export const figureRequestKey = (source: string, settings: FigureSettings) =>
  figureIdentity(source, settings);

export interface FigureSource {
  key: string;
  render(settings: FigureSettings): Promise<Blob>;
  onStart?(): void;
}
const cancelled = () =>
  new DOMException("Figure settings superseded.", "AbortError");
interface Request {
  key: string;
  settings: FigureSettings;
  source: FigureSource;
  signal: AbortSignal;
  resolve(blob: Blob): void;
  reject(error: unknown): void;
}

/** One native capture and at most one latest pending choice; never race a live canvas. */
export class FigureRenderQueue {
  private active: { key: string; work: Promise<Blob> } | null = null;
  private pending: Request | null = null;
  private startedSource: string | null = null;
  async request(
    settings: FigureSettings,
    source: FigureSource,
    signal: AbortSignal,
  ): Promise<Blob> {
    signal.throwIfAborted();
    const copy = { ...settings },
      key = figureRequestKey(source.key, copy);
    if (this.active?.key === key) {
      this.pending?.reject(cancelled());
      this.pending = null;
      return renderWithin(this.active.work, signal);
    }
    this.pending?.reject(cancelled());
    let request!: Request;
    const work = new Promise<Blob>((resolve, reject) => {
      request = {
        key,
        settings: copy,
        source: { ...source },
        signal,
        resolve,
        reject,
      };
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
      if (this.startedSource !== request.source.key) {
        this.startedSource = request.source.key;
        request.source.onStart?.();
      }
      return request.source.render(request.settings);
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
