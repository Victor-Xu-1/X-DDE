import { useCallback, useEffect, useState, type RefObject } from "react";
import {
  expandedWorkspace,
  expansionChange,
  toggleWorkspace,
} from "./workspace-expansion";

function targetFor(anchor: HTMLElement | null) {
  return (
    anchor?.closest<HTMLElement>(".structure-workbench") ??
    anchor?.closest<HTMLElement>(
      ".viewer-panel, .simulation-molecular-viewport",
    ) ??
    null
  );
}

/** Shared in-page expansion; controls subscribe to the one live workspace. */
export function useWorkspaceFullscreen(
  anchor: RefObject<HTMLButtonElement | null>,
  label: string,
) {
  const [state, setState] = useState({ active: false, workspace: false });
  const [error, setError] = useState(false);
  const toggle = useCallback(() => {
    const target = targetFor(anchor.current);
    if (!target || !anchor.current) return;
    setError(false);
    try {
      toggleWorkspace(target, anchor.current, label);
    } catch {
      setError(true);
    }
  }, [anchor, label]);
  useEffect(() => {
    function synchronize() {
      const target = targetFor(anchor.current);
      setState({
        active: Boolean(target && expandedWorkspace() === target),
        workspace: Boolean(target?.classList.contains("structure-workbench")),
      });
    }
    synchronize();
    document.addEventListener(expansionChange, synchronize);
    return () => document.removeEventListener(expansionChange, synchronize);
  }, [anchor]);
  return { ...state, error, toggle };
}
