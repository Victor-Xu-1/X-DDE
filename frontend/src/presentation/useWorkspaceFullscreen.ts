import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type RefObject,
} from "react";

function targetFor(anchor: HTMLElement | null) {
  return (
    anchor?.closest<HTMLElement>(".structure-workbench") ??
    anchor?.closest<HTMLElement>(
      ".viewer-panel, .simulation-molecular-viewport",
    ) ??
    null
  );
}

/** Native fullscreen changes presentation only; the scene and selected inputs stay mounted. */
export function useWorkspaceFullscreen(anchor: RefObject<HTMLElement | null>) {
  const [state, setState] = useState({ active: false, workspace: false });
  const [error, setError] = useState(false);
  const [pending, setPending] = useState(false);
  const live = useRef(false),
    busy = useRef(false),
    serial = useRef(0);
  const toggle = useCallback(async () => {
    if (busy.current) return;
    const target = targetFor(anchor.current),
      attempt = ++serial.current;
    busy.current = true;
    setPending(true);
    setError(false);
    const exiting = Boolean(target && document.fullscreenElement === target);
    try {
      if (!target) throw new Error("No molecular viewport.");
      if (exiting) await document.exitFullscreen();
      else await target.requestFullscreen();
    } catch {
      if (
        live.current &&
        attempt === serial.current &&
        targetFor(anchor.current) === target &&
        !(exiting && document.fullscreenElement !== target)
      )
        setError(true);
    } finally {
      busy.current = false;
      if (live.current && attempt === serial.current) setPending(false);
    }
  }, [anchor]);
  useEffect(() => {
    live.current = true;
    function synchronize() {
      const target = targetFor(anchor.current);
      setState({
        active: Boolean(target && document.fullscreenElement === target),
        workspace: Boolean(target?.classList.contains("structure-workbench")),
      });
    }
    function keydown(event: KeyboardEvent) {
      if (
        event.key !== "Escape" ||
        event.defaultPrevented ||
        busy.current ||
        event.altKey ||
        event.ctrlKey ||
        event.metaKey ||
        document.querySelector("dialog[open]")
      )
        return;
      const target = targetFor(anchor.current);
      if (!target || document.fullscreenElement !== target) return;
      // One owner handles Escape even when paired views share this workspace.
      // Use the native exit API; do not build an alternate fullscreen overlay.
      event.preventDefault();
      void toggle();
    }
    synchronize();
    document.addEventListener("fullscreenchange", synchronize);
    document.addEventListener("keydown", keydown);
    return () => {
      live.current = false;
      serial.current++;
      document.removeEventListener("fullscreenchange", synchronize);
      document.removeEventListener("keydown", keydown);
    };
  }, [anchor, toggle]);
  return { ...state, error, pending, toggle };
}
