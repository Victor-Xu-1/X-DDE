import { useState, type ReactNode } from "react";
import type { Language } from "../types";
import type { MoleculeRef, ScientificObject } from "../research/types";
import { usePoseSession } from "./PoseSession";
import "./pose-study-input.css";

export interface PoseStudySelection {
  reference: MoleculeRef;
  object: ScientificObject | null;
  ready: boolean;
  displayed: boolean;
  receptor: MoleculeRef | null | undefined;
}
const sameReference = (a: MoleculeRef | null, b: MoleculeRef | null) =>
  !!a &&
  !!b &&
  a.asset_id === b.asset_id &&
  a.sha256 === b.sha256 &&
  a.record === b.record &&
  a.conformer === b.conformer;

/** A click captures this explicit version; later preview changes never edit a task draft. */
export function PoseStudyInput({
  original,
  language,
  children,
}: {
  original: ScientificObject | MoleculeRef | null | undefined;
  language: Language;
  children(selection: PoseStudySelection | null, waiting: boolean): ReactNode;
}) {
  const workspace = usePoseSession();
  const originalObject = original && "reference" in original ? original : null;
  const originalRef =
    originalObject?.reference ?? (original as MoleculeRef | null) ?? null;
  const current = workspace?.controller.pose.object ?? null;
  const currentRef = current?.reference ?? null;
  const key = workspace?.plan.key ?? JSON.stringify(originalRef);
  const [choice, setChoice] = useState({
    key,
    mode: "displayed" as "displayed" | "original",
  });
  const mode =
    workspace?.inputMode ?? (choice.key === key ? choice.mode : "displayed");
  const waiting =
    !!workspace &&
    (workspace.controller.busy ||
      (workspace.controller.initializing &&
        !workspace.controller.initialReady));
  const different = !!currentRef && !sameReference(originalRef, currentRef);
  const useCurrent = mode === "displayed" && different;
  const object = useCurrent ? current : originalObject;
  const reference = useCurrent ? currentRef : originalRef;
  const selection: PoseStudySelection | null = reference
    ? {
        reference,
        object,
        ready: mode === "original" || !waiting,
        displayed: useCurrent,
        receptor: useCurrent
          ? workspace?.controller.pose.receptorReference
          : undefined,
      }
    : null;
  const zh = language === "zh";
  return (
    <div className="pose-study-input">
      {(different || waiting) && originalRef && (
        <fieldset className="pose-study-choices">
          <legend>{zh ? "后续研究使用" : "Input for the next study"}</legend>
          {(["displayed", "original"] as const).map((value) => (
            <label key={value}>
              <input
                type="radio"
                name={"pose-input-" + key}
                value={value}
                checked={mode === value}
                onChange={() => {
                  if (workspace) workspace.chooseInput(value);
                  else setChoice({ key, mode: value });
                }}
              />
              <span>
                {value === "displayed"
                  ? zh
                    ? "当前 pose"
                    : "Current pose"
                  : zh
                    ? "原始结果"
                    : "Original result"}
              </span>
            </label>
          ))}
        </fieldset>
      )}
      {children(selection, waiting)}
    </div>
  );
}
