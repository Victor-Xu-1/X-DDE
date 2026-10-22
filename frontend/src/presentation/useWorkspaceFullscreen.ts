import { useEffect, useRef, useState, type RefObject } from "react";

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
  useEffect(() => {
    live.current = true;
    function synchronize() {
      const target = targetFor(anchor.current);
      setState({
        active: Boolean(target && document.fullscreenElement === target),
        workspace: Boolean(target?.classList.contains("structure-workbench")),
      });
    }
    synchronize();
    document.addEventListener("fullscreenchange", synchronize);
    return () => {
      live.current = false;
      serial.current++;
      document.removeEventListener("fullscreenchange", synchronize);
    };
  }, [anchor]);

  async function toggle() {
    if (busy.current) return;
    const target = targetFor(anchor.current),
      attempt = ++serial.current;
    busy.current = true;
    setPending(true);
    setError(false);
    try {
      if (!target) throw new Error("No molecular viewport.");
      if (document.fullscreenElement === target)
        await document.exitFullscreen();
      else await target.requestFullscreen();
    } catch {
      if (
        live.current &&
        attempt === serial.current &&
        targetFor(anchor.current) === target
      )
        setError(true);
    } finally {
      busy.current = false;
      if (live.current && attempt === serial.current) setPending(false);
    }
  }
  return { ...state, error, pending, toggle };
}
