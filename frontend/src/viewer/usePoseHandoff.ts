import { useState } from "react";
import type { PoseStudySelection } from "./PoseStudyInput";

/** A new task draft uses the exact version confirmed at the click, never a later pose. */
export function usePoseHandoff<Action extends string>(sourceKey: string) {
  const [saved, setSaved] = useState<{
    sourceKey: string;
    action: Action;
    selection: PoseStudySelection;
  } | null>(null);
  return {
    value: saved?.sourceKey === sourceKey ? saved : null,
    open(action: Action, selection: PoseStudySelection) {
      if (selection.ready) setSaved({ sourceKey, action, selection });
    },
    clear() {
      setSaved(null);
    },
  };
}
