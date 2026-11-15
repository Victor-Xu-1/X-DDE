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
