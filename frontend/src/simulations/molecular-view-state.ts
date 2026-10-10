import type { Camera } from "molstar/lib/mol-canvas3d/camera";
import type { FigureSettings } from "../publication/settings";
import type { MolecularView } from "./molstar-controller";
import type { FigurePixels } from "./molstar-figure";

export interface SavedMolecularView {
  view: MolecularView;
  camera?: Camera.Snapshot;
}
export interface MolecularViewHandle {
  capture(settings: FigureSettings, pixels?: FigurePixels): Promise<Blob>;
  snapshot(): SavedMolecularView;
  restoreCamera(snapshot: Camera.Snapshot): void;
}

/** Hidden analysis tabs do not allocate WebGL or load models until they have a viewport. */
export function visibleViewport(
  element: HTMLElement,
  signal: AbortSignal,
): Promise<void> {
  signal.throwIfAborted();
  if (element.offsetWidth > 0 && element.offsetHeight > 0)
    return Promise.resolve();
  return new Promise((resolve, reject) => {
    const observer = new ResizeObserver(() => {
      if (element.offsetWidth > 0 && element.offsetHeight > 0) {
        close();
        resolve();
      }
    });
    const abort = () => {
      close();
      reject(signal.reason);
    };
    const close = () => {
      observer.disconnect();
      signal.removeEventListener("abort", abort);
    };
    signal.addEventListener("abort", abort, { once: true });
    observer.observe(element);
  });
}
