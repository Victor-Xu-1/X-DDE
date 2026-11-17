import { useCallback, useRef, useState } from "react";
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

const utilities = {
  admet: { capability: "admet.predict", Form: AdmetForm },
  brain: { capability: "admet.brain", Form: AdmetForm },
  properties: { capability: "properties", Form: PropertyForm },
  screen: { capability: "chemistry.screen", Form: LibraryScreenForm },
  states: { capability: "chemistry.states", Form: StateForm },
} as const;
export type MolecularUtility = keyof typeof utilities;
type UtilityTaskProps = {
  tool: MolecularUtility;
  language: Language;
  onCreated(job: Job): void;
  jobs?: readonly Job[];
  active?: boolean;
};

/** New tasks replace the whole session, including outstanding template intent. */
export function UtilityTask(props: UtilityTaskProps) {
  const [generation, setGeneration] = useState(0);
  return (
    <InputActionScope key={props.tool + ":" + generation}>
      <UtilityTaskSession
        {...props}
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
  jobs = [],
  active = true,
}: UtilityTaskProps & { onReset(): void }) {
  const { capability, Form } = utilities[tool];
  const [example, setExample] = useState<PreparedExample | null>(null);
  const [revision, setRevision] = useState(0);
  const [previewing, setPreviewing] = useState(false);
  const [completed, setCompleted] = useState(false);
  const actions = useInputActionScope()!;
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
  }
  return (
    <section className="molecular-utility">
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
          onBusyChange={exampleBusy}
        />
      </fieldset>
      <div className="utility-task-form" hidden={previewing}>
        {completed && !example && (
          <div className="utility-toolbar">
            <button
              type="button"
              className="secondary-button"
              disabled={actions.action === "submission"}
              onClick={() => {
                if (!actions.isLocked("submission")) onReset();
              }}
            >
              {language === "zh" ? "新建任务" : "New task"}
            </button>
          </div>
        )}
        <fieldset
          className="utility-task-fields"
          disabled={actions.action === "example"}
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
                renderResult: (job) => (
                  <UtilityTaskResult
                    accepted={job}
                    jobs={jobs}
                    active={active}
                    language={language}
                    onCreated={onCreated}
                  />
                ),
              }}
            >
              <Form
                language={language}
                {...(tool === "brain" ? { focus: "brain" as const } : {})}
                onCreated={(job) => {
                  setCompleted(true);
                  onCreated(job);
                }}
              />
            </TaskPresentationContext.Provider>
          </ExampleContext.Provider>
        </fieldset>
      </div>
    </section>
  );
}
