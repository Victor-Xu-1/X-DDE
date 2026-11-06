import { request } from "../api";
import type { Confidence } from "./confidence-data";

function backoff(signal: AbortSignal, milliseconds: number) {
  return new Promise<void>((resolve, reject) => {
    const abort = () => {
      clearTimeout(timer);
      signal.removeEventListener("abort", abort);
      reject(signal.reason);
    };
    const timer = setTimeout(() => {
      signal.removeEventListener("abort", abort);
      resolve();
    }, milliseconds);
    signal.addEventListener("abort", abort, { once: true });
    if (signal.aborted) abort();
  });
}

/** A cancelled reader may still own its bounded server slot for a short time. */
export async function requestConfidence(path: string, signal: AbortSignal) {
  signal.throwIfAborted();
  const controller = new AbortController();
  const deadline = setTimeout(
    () =>
      controller.abort(
        new DOMException("Confidence read timed out", "TimeoutError"),
      ),
    30000,
  );
  const abort = () => {
    clearTimeout(deadline);
    controller.abort(signal.reason);
  };
  signal.addEventListener("abort", abort, { once: true });
  try {
    for (let attempt = 0; ; attempt++) {
      controller.signal.throwIfAborted();
      try {
        return await request<Confidence>(path, { signal: controller.signal });
      } catch (error) {
        if (
          controller.signal.aborted ||
          attempt === 2 ||
          !(
            error &&
            typeof error === "object" &&
            "status" in error &&
            error.status === 429
          )
        )
          throw error;
        await backoff(controller.signal, (attempt + 1) * 500);
      }
    }
  } finally {
    clearTimeout(deadline);
    signal.removeEventListener("abort", abort);
  }
}
