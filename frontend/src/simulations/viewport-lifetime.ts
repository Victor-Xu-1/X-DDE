/** Close immediately to callers; release native resources after pending setup settles. */
export class ViewportLifetime {
  private abort = new AbortController();
  private started = false;
  private pending = 0;
  private released = false;

  constructor(private release: () => void) {}

  get signal() {
    return this.abort.signal;
  }

  ensureOpen() {
    this.signal.throwIfAborted();
    if (this.released) throw new Error("The molecular viewport has closed.");
  }

  async initialize(setup: (checkOpen: () => void) => Promise<void>) {
    this.ensureOpen();
    if (this.started)
      throw new Error("The molecular viewport was already initialized.");
    this.started = true;
    let ready = false;
    try {
      await this.during(setup);
      ready = true;
    } finally {
      if (!ready) this.close();
    }
  }

  close() {
    this.abort.abort();
    if (!this.pending) this.releaseOnce();
  }

  async during<T>(operation: (checkOpen: () => void) => Promise<T>) {
    this.ensureOpen();
    this.pending++;
    try {
      const result = await operation(() => this.ensureOpen());
      this.ensureOpen();
      return result;
    } finally {
      this.pending--;
      if (!this.pending && this.signal.aborted) this.releaseOnce();
    }
  }

  private releaseOnce() {
    if (this.released) return;
    this.released = true;
    this.release();
  }
}
