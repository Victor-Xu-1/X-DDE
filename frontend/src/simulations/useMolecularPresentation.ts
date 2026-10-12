import { useCallback, useEffect, useState } from "react";
import type { MolecularController, MolecularView } from "./molstar-controller";

interface Presentation {
  key: string;
  source: string;
  phase: "updating" | "ready" | "failed";
  frame: number;
}

/** A frame and its requested display must both succeed before capture is available. */
export function useMolecularPresentation(
  instance: MolecularController | null,
  loaded: boolean,
  source: string,
  trajectory: boolean,
  frame: number,
  view: MolecularView,
) {
  const [attempt, setAttempt] = useState(0);
  const [state, setState] = useState<Presentation>({
    key: "",
    source: "",
    phase: "updating",
    frame: 0,
  });
  const key = JSON.stringify([source, frame, view, attempt]);
  useEffect(() => {
    if (!loaded || !instance) return;
    let active = true;
    setState((old) => ({
      key,
      source,
      phase: "updating",
      frame: old.source === source ? old.frame : 0,
    }));
    let confirmed = !trajectory;
    const seek = trajectory
      ? instance.setFrame(frame, () => {
          confirmed = true;
        })
      : Promise.resolve();
    const display = instance.setView(view);
    void Promise.all([seek, display]).then(
      () => {
        if (!active || !confirmed) return;
        setState({ key, source, phase: "ready", frame });
      },
      () => {
        if (active) setState((old) => ({ ...old, phase: "failed" }));
      },
    );
    return () => {
      active = false;
    };
  }, [instance, loaded, source, trajectory, frame, view, key]);
  const ready = loaded && state.key === key && state.phase === "ready";
  const failed = loaded && state.key === key && state.phase === "failed";
  const retry = useCallback(() => setAttempt((value) => value + 1), []);
  return {
    ready,
    failed,
    busy: loaded && !ready && !failed,
    presentedFrame: state.source === source ? state.frame : 0,
    retry,
  };
}
