import { useContext, useLayoutEffect, useRef, useState } from "react";
import {
  InputActionScope,
  useInputActionScope,
} from "../guided/InputActionScope";
import { TaskPresentationContext } from "../guided/TaskPresentation";
import { FollowupBackendControl } from "../utilities/TaskBackendControl";
import type { MoleculeRef } from "../research/types";
import type { Job, Language } from "../types";
import { StateForm } from "./StateForm";
import "./result-preparation.css";

type Preparation = { reference: MoleculeRef; label: string };

export function useStatePreparation() {
  const [input, setInput] = useState<Preparation | null>(null);
  const origin = useRef<HTMLButtonElement | null>(null);
  function open(
    reference: MoleculeRef,
    label: string,
    trigger: HTMLButtonElement,
  ) {
    origin.current = trigger;
    setInput({ reference, label });
  }
  useLayoutEffect(() => {
    if (input || !origin.current) return;
    origin.current.focus();
    origin.current = null;
  }, [input]);
  return { input, open, close: () => setInput(null) };
}

type Props = {
  input: Preparation;
  language: Language;
  backLabel: string;
  onBack(): void;
  onCreated(job: Job): void;
};

export function StatePreparationHandoff(props: Props) {
  const scope = useInputActionScope();
  return scope ? (
    <PreparationForm {...props} />
  ) : (
    <InputActionScope>
      <PreparationForm {...props} />
    </InputActionScope>
  );
}

function PreparationForm({
  input,
  language,
  backLabel,
  onBack,
  onCreated,
}: Props) {
  const scope = useInputActionScope()!;
  const zh = language === "zh";
  const title = zh ? "分子准备" : "Molecule preparation";
  const singlePage = useContext(TaskPresentationContext)?.layout === "single";
  const heading = useRef<HTMLHeadingElement>(null);
  useLayoutEffect(() => {
    // The guided form already focuses its active step heading.
    if (singlePage) heading.current?.focus();
  }, [singlePage]);
  return (
    <section className="state-preparation-handoff" aria-label={title}>
      <header className="state-preparation-heading">
        <button
          className="secondary-button"
          type="button"
          disabled={scope.action === "submission"}
          onClick={() => {
            if (!scope.isLocked("submission")) onBack();
          }}
        >
          {backLabel}
        </button>
        <div className="state-preparation-title">
          <h3 ref={heading} tabIndex={singlePage ? -1 : undefined}>
            {title}
          </h3>
          <span>{input.label}</span>
        </div>
        <FollowupBackendControl
          language={language}
          capability="chemistry.states"
        />
      </header>
      <StateForm
        language={language}
        onCreated={onCreated}
        initialMolecule={input.reference}
      />
    </section>
  );
}
