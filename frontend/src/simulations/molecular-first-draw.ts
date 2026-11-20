type DrawSource = {
  readonly reprCount: { readonly value: number };
  readonly commitQueueSize: { readonly value: number };
  readonly didDraw: {
    readonly value: number;
    subscribe(listener: (stamp: number) => void): { unsubscribe(): void };
  };
  requestDraw(): void;
};

/** The draw notification is replayed. Wait for a new draw of committed geometry. */
export function waitForMolecularDraw(source: DrawSource, signal: AbortSignal) {
  signal.throwIfAborted();
  return new Promise<void>((resolve, reject) => {
    const previous = source.didDraw.value;
    const subscription = source.didDraw.subscribe((stamp) => {
      if (
        stamp !== previous &&
        source.commitQueueSize.value === 0 &&
        source.reprCount.value > 0
      ) {
        finish();
        resolve();
      }
    });
    function finish() {
      subscription.unsubscribe();
      signal.removeEventListener("abort", onAbort);
    }
    function onAbort() {
      finish();
      reject(signal.reason);
    }
    signal.addEventListener("abort", onAbort, { once: true });
    source.requestDraw();
  });
}
