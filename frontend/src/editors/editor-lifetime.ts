/** Per-canvas operation ordering only; no server job, engine or persistent queue. */
export function editorLifetime(
  signal: AbortSignal,
  onState: (state: { busy: boolean; available: boolean }) => void,
) {
  let tail: Promise<unknown> = Promise.resolve();
  let pending = 0,
    valid = false,
    failures = 0;
  const notify = () => {
    if (!signal.aborted)
      onState({ busy: pending > 0, available: valid && pending === 0 });
  };
  return {
    get failures() {
      return failures;
    },
    get valid() {
      return valid;
    },
    invalidate() {
      valid = false;
      notify();
    },
    accept() {
      valid = true;
      notify();
    },
    fail() {
      failures++;
      valid = false;
      notify();
    },
    run<T>(action: () => Promise<T>): Promise<T> {
      signal.throwIfAborted();
      pending++;
      notify();
      const operation = tail.then(async () => {
        signal.throwIfAborted();
        try {
          return await action();
        } catch (error) {
          valid = false;
          throw error;
        }
      });
      tail = operation.catch(() => {});
      return operation.finally(() => {
        pending--;
        notify();
      });
    },
  };
}

/** Measure cumulative resize against a retained reference, including hidden views. */
export function editorResize(fit: (resized: boolean) => boolean) {
  let reference: { width: number; height: number } | null = null;
  return (width: number, height: number) => {
    if (
      !Number.isFinite(width) ||
      !Number.isFinite(height) ||
      width < 1 ||
      height < 1
    )
      return;
    const resized = Boolean(
      reference &&
      (Math.abs(width - reference.width) > reference.width * 0.1 ||
        Math.abs(height - reference.height) > reference.height * 0.1),
    );
    reference ??= { width, height };
    if (fit(resized)) reference = { width, height };
  };
}
