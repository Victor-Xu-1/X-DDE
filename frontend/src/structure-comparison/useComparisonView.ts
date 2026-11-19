import { useMemo, useRef, useState } from "react";
import type {
  StructureCameraSnapshot,
  StructureCameraHandle,
} from "../viewer/structure-camera";

export type ComparisonView = "overlay" | "reference" | "moving" | "pair";
type Panel = Exclude<ComparisonView, "pair"> | "pair-reference" | "pair-moving";
const panels: readonly Panel[] = [
  "overlay",
  "reference",
  "moving",
  "pair-reference",
  "pair-moving",
];
const pairPanels = ["pair-reference", "pair-moving"] as const;

export function useComparisonView() {
  const [view, setView] = useState<ComparisonView>("overlay");
  const [busy, setBusy] = useState(false);
  const [cameraFailed, setCameraFailed] = useState(false);
  const [ready, setReady] = useState<Partial<Record<Panel, boolean>>>({});
  const working = useRef(false);
  const handles = useRef<Partial<Record<Panel, StructureCameraHandle>>>({});
  const saved = useRef<Partial<Record<Panel, StructureCameraSnapshot>>>({});
  const publish = useMemo(
    () =>
      Object.fromEntries(
        panels.map((panel) => [
          panel,
          (handle: StructureCameraHandle | null) => {
            handles.current[panel] = handle ?? undefined;
            setReady((previous) => ({ ...previous, [panel]: Boolean(handle) }));
            const camera = saved.current[panel];
            if (camera) handle?.apply(camera);
          },
        ]),
      ) as Record<Panel, (handle: StructureCameraHandle | null) => void>,
    [],
  );
  async function work(action: () => Promise<void>) {
    if (working.current) return;
    working.current = true;
    setBusy(true);
    setCameraFailed(false);
    try {
      await action();
    } catch {
      setCameraFailed(true);
    } finally {
      working.current = false;
      setBusy(false);
    }
  }
  function change(next: ComparisonView) {
    if (view === next) return;
    void work(async () => {
      const active: readonly Panel[] = view === "pair" ? pairPanels : [view];
      await Promise.all(
        active.map(async (panel) => {
          const camera = await handles.current[panel]?.read();
          if (camera) saved.current[panel] = camera;
        }),
      );
      setView(next);
    });
  }
  function matchViews() {
    void work(async () => {
      const moving = handles.current["pair-moving"];
      const camera = await handles.current["pair-reference"]?.read();
      if (!camera || !moving || handles.current["pair-moving"] !== moving) {
        setCameraFailed(true);
        return;
      }
      moving.apply(camera);
    });
  }
  return {
    view,
    busy,
    cameraFailed,
    publish,
    change,
    matchViews,
    pairReady: Boolean(ready["pair-reference"] && ready["pair-moving"]),
  };
}
