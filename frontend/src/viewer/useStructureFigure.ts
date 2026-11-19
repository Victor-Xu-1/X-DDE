import { useLayoutEffect, useRef } from "react";
import type { FigurePanel } from "../publication/figure-panels";

export type StructureFigureHandle = FigurePanel & { sourceKey: string };

/** Publish the renderer of one loaded scene and retire it before a replacement is usable. */
export function useStructureFigure(
  sourceKey: string,
  ready: boolean,
  capture: FigurePanel["capture"],
  onReady?: (handle: StructureFigureHandle | null) => void,
) {
  const renderer = useRef(capture);
  useLayoutEffect(() => {
    renderer.current = capture;
  });
  useLayoutEffect(() => {
    if (!onReady || !ready) return;
    let current = true;
    function check() {
      if (!current)
        throw new Error("The molecular view changed during export.");
    }
    onReady({
      sourceKey,
      async capture(settings, pixels) {
        check();
        const result = await renderer.current(settings, pixels);
        check();
        return result;
      },
    });
    return () => {
      current = false;
      onReady(null);
    };
  }, [sourceKey, ready, onReady]);
}
