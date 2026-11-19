import { useCallback, useLayoutEffect, useRef, useState } from "react";
import type { Job, Language } from "../types";
import { ExampleActions } from "../examples/ExampleActions";
import { ExampleContext } from "../examples/context";
import type { PreparedExample } from "../examples/types";
import { AdmetForm } from "../admet/AdmetForm";
import { PropertyForm } from "../operations/PropertyForm";
import { LibraryScreenForm } from "../chemistry/LibraryScreenForm";
import { StateForm } from "../chemistry/StateForm";
import {
  InputActionScope,
  useInputActionScope,
} from "../guided/InputActionScope";
import "./utility-task.css";
import { TaskPresentationContext } from "../guided/TaskPresentation";
import { UtilityTaskResult } from "./UtilityTaskResult";
import { UtilityDrawingContext } from "./UtilityDrawingContext";
import type { EditorDrawing } from "./useRecognitionDrawing";

const utilities = {
  admet: { capability: "admet.predict", Form: AdmetForm },
  brain: { capability: "admet.brain", Form: AdmetForm },
  properties: { capability: "properties", Form: PropertyForm },
  screen: { capability: "chemistry.screen", Form: LibraryScreenForm },
  states: { capability: "chemistry.states", Form: StateForm },
} as const;
export type MolecularUtility = keyof typeof utilities;
export const utilityCapability = (id: MolecularUtility) =>
  utilities[id].capability;
export const molecularUtilityCapabilities = Object.values(utilities).map(
  ({ capability }) => capability,
);
type UtilityTaskProps = {
  tool: MolecularUtility;
  language: Language;
  onCreated(job: Job): void;
  jobs?: readonly Job[];
  active?: boolean;
  drawing?: EditorDrawing;
  onDrawingHandled?(id: string): void;
};

/** New tasks replace the whole session, including outstanding template intent. */
export function UtilityTask(props: UtilityTaskProps) {
  const [generation, setGeneration] = useState(0);
  return (
    <InputActionScope key={props.tool + ":" + generation}>
      <UtilityTaskSession
        {...props}
        focusInputOnStart={generation > 0}
        onReset={() => setGeneration((current) => current + 1)}
      />
    </InputActionScope>
  );
}

function UtilityTaskSession({
  tool,
  language,
  onCreated,
  onReset,
  focusInputOnStart,
  drawing,
  onDrawingHandled,
  jobs = [],
  active = true,
}: UtilityTaskProps & { onReset(): void; focusInputOnStart: boolean }) {
  const { capability, Form } = utilities[tool];
  const [example, setExample] = useState<PreparedExample | null>(null);
  const [revision, setRevision] = useState(0);
  const [previewing, setPreviewing] = useState(false);
  const [completed, setCompleted] = useState(false);
  const [matched, setMatched] = useState<Job | null>(null);
  const [view, setView] = useState<"inputs" | "results">("inputs");
  const zh = language === "zh";
  const visibleResult = view === "results" && !previewing ? matched : null;
  const resultHeading = useRef<HTMLHeadingElement>(null);
  const inputWorkspace = useRef<HTMLDivElement>(null);
  const focusNext = useRef<"inputs" | "results" | null>(
    focusInputOnStart ? "inputs" : null,
  );
  function open(target: "inputs" | "results") {
    focusNext.current = active ? target : null;
    setView(target);
  }
  useLayoutEffect(() => {
    if (!active || previewing) {
      focusNext.current = null;
      return;
    }
    const section = visibleResult ? "results" : "inputs";
    if (focusNext.current !== section) return;
    const target = visibleResult
      ? resultHeading.current
      : inputWorkspace.current;
    target?.focus();
    focusNext.current = null;
  }, [active, previewing, visibleResult]);
  const actions = useInputActionScope()!;
  const shownDrawing = useRef<string | null>(null);
  useLayoutEffect(() => {
    if (
      !drawing ||
      !active ||
      previewing ||
      actions.action ||
      shownDrawing.current === drawing.id
    )
      return;
    shownDrawing.current = drawing.id;
    if (visibleResult) {
      focusNext.current = "inputs";
      setView("inputs");
    } else inputWorkspace.current?.focus();
  }, [drawing, active, previewing, actions.action, visibleResult]);
  const finishExample = useRef<(() => void) | null>(null);
  const exampleBusy = useCallback(
    (pending: boolean) => {
      if (pending) finishExample.current ??= actions.begin("example");
      else {
        finishExample.current?.();
        finishExample.current = null;
      }
    },
    [actions.begin],
  );
  function replace(value: PreparedExample | null) {
    setExample(value);
    setRevision((current) => current + 1);
    setCompleted(false);
    setMatched(null);
    setView("inputs");
  }
  return (
    <section className="molecular-utility">
      <fieldset
        className="utility-template-controls"
        hidden={Boolean(visibleResult)}
        disabled={actions.action === "submission"}
      >
        <legend className="sr-only">
          {language === "zh" ? "模板与示例" : "Templates and examples"}
        </legend>
        <ExampleActions
          capability={capability}
          language={language}
          onLoad={replace}
          onClear={() => replace(null)}
          onPreviewChange={setPreviewing}
          active={active && !visibleResult}
          onBusyChange={exampleBusy}
        />
      </fieldset>
      <div
        ref={inputWorkspace}
        className="utility-task-form"
        hidden={previewing || Boolean(visibleResult)}
        tabIndex={-1}
        role="region"
        aria-label={zh ? "任务输入" : "Task inputs"}
      >
        {completed && (
          <div className="utility-toolbar">
            {matched && (
              <button
                type="button"
                className="secondary-button"
                disabled={actions.action === "submission"}
                onClick={() => open("results")}
              >
                {zh ? "查看本次结果" : "View current results"}
              </button>
            )}
            {!example && (
              <button
                type="button"
                className="secondary-button"
                disabled={actions.action === "submission"}
                onClick={() => {
                  if (!actions.isLocked("submission")) onReset();
                }}
              >
                {zh ? "新建任务" : "New task"}
              </button>
            )}
          </div>
        )}
        <fieldset
          className="utility-task-fields"
          disabled={
            actions.action === "example" ||
            actions.action === "structure-import"
          }
        >
          <legend className="sr-only">
            {language === "zh" ? "任务材料与设置" : "Task inputs and settings"}
          </legend>
          <ExampleContext.Provider
            key={revision}
            value={
              example?.module.capability_id === capability ? example : null
            }
          >
            <TaskPresentationContext.Provider
              value={{
                layout: "single",
                active: active && !previewing && !visibleResult,
                imageEntry: "workspace",
                onMatchingResult: setMatched,
              }}
            >
              <UtilityDrawingContext.Provider
                value={
                  drawing && onDrawingHandled
                    ? { ...drawing, dismiss: onDrawingHandled }
                    : null
                }
              >
                <Form
                  language={language}
                  {...(tool === "brain" ? { focus: "brain" as const } : {})}
                  onCreated={(job) => {
                    setCompleted(true);
                    open("results");
                    onCreated(job);
                  }}
                />
              </UtilityDrawingContext.Provider>
            </TaskPresentationContext.Provider>
          </ExampleContext.Provider>
        </fieldset>
      </div>
      {matched && (
        <UtilityTaskResult
          accepted={matched}
          jobs={jobs}
          active={active && !previewing}
          hidden={!visibleResult}
          language={language}
          onCreated={onCreated}
          headingRef={resultHeading}
          onEdit={() => open("inputs")}
          onNewTask={onReset}
        />
      )}
    </section>
  );
}
