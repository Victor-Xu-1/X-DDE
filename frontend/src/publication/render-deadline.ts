/** Stop waiting on a stalled native renderer; late results are observed but never exported. */
export async function renderWithin<T>(
  work: Promise<T>,
  signal: AbortSignal,
  timeoutMs = 30000,
): Promise<T> {
  signal.throwIfAborted();
  let timer: ReturnType<typeof setTimeout> | undefined;
  let abort = () => {};
  try {
    return await Promise.race([
      work,
      new Promise<never>((_, reject) => {
        abort = () =>
          reject(new DOMException("Figure export cancelled.", "AbortError"));
        signal.addEventListener("abort", abort, { once: true });
        timer = setTimeout(
          () => reject(new Error("Native figure rendering timed out.")),
          timeoutMs,
        );
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
    signal.removeEventListener("abort", abort);
  }
}
