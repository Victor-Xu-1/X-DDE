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
import "./utility-review-workspace.css";
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
  const [imageTarget, setImageTarget] = useState<HTMLDivElement | null>(null);
  const [submitTarget, setSubmitTarget] = useState<HTMLDivElement | null>(null);
  const zh = language === "zh";
  const resultHeading = useRef<HTMLHeadingElement>(null);
  const inputWorkspace = useRef<HTMLDivElement>(null);
  const focusResult = useRef(false);
  useLayoutEffect(() => {
    if (focusInputOnStart && active)
      imageTarget?.querySelector<HTMLDivElement>(".utility-image-pad")?.focus();
  }, [active, focusInputOnStart, imageTarget]);
  useLayoutEffect(() => {
    if (!active || previewing) focusResult.current = false;
    if (!matched || !focusResult.current) return;
    resultHeading.current?.focus();
    focusResult.current = false;
  }, [active, previewing, matched]);
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
    imageTarget
      ?.querySelector<HTMLDivElement>(
        ".utility-image-pad:has(.utility-drawing-offer)",
      )
      ?.focus();
  }, [drawing, active, previewing, actions.action, imageTarget]);
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
  }
  return (
    <section className="molecular-utility">
      <div className="utility-review-workspace" hidden={previewing}>
        <section
          className="utility-source-pane"
          aria-label={zh ? "图片输入" : "Image input"}
        >
          <h2>{zh ? "图片输入" : "Image input"}</h2>
          <div ref={setImageTarget} className="utility-image-sources" />
        </section>
        <div className="utility-result-pane">
          <div className="utility-result-scroll">
            {matched ? (
              <UtilityTaskResult
                accepted={matched}
                jobs={jobs}
                active={active && !previewing}
                hidden={previewing}
                language={language}
                onCreated={onCreated}
                headingRef={resultHeading}
                onEdit={() => inputWorkspace.current?.focus()}
                onNewTask={onReset}
              />
            ) : (
              <section
                className="utility-result-empty"
                aria-label={zh ? "本次结果" : "Current results"}
              >
                <h2>{zh ? "结果" : "Results"}</h2>
                <p>
                  {zh
                    ? "运行后在这里查看结果。"
                    : "Results appear here after you run the tool."}
                </p>
              </section>
            )}
          </div>
          <div ref={setSubmitTarget} className="utility-run-controls" />
        </div>
      </div>
      <fieldset
        className="utility-template-controls"
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
          active={active}
          onBusyChange={exampleBusy}
        />
      </fieldset>
      <div
        ref={inputWorkspace}
        className="utility-task-form"
        hidden={previewing}
        tabIndex={-1}
        role="region"
        aria-label={zh ? "任务输入" : "Task inputs"}
      >
        <h2>{zh ? "其他输入与设置" : "Other inputs and settings"}</h2>
        {completed && !matched && !example && (
          <div className="utility-toolbar">
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
          </div>
        )}
        <fieldset
          className="utility-task-fields"
          disabled={Boolean(actions.action)}
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
                active: active && !previewing,
                imageEntry: "workspace",
                imageTarget,
                submitTarget,
                submitLocked: Boolean(actions.action),
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
                    focusResult.current = active;
                    onCreated(job);
                  }}
                />
              </UtilityDrawingContext.Provider>
            </TaskPresentationContext.Provider>
          </ExampleContext.Provider>
        </fieldset>
      </div>
    </section>
  );
}
