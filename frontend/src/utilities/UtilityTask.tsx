import { useState } from "react";
import type { Job, Language } from "../types";
import { ExampleActions } from "../examples/ExampleActions";
import { ExampleContext } from "../examples/context";
import type { PreparedExample } from "../examples/types";
import { AdmetForm } from "../admet/AdmetForm";
import { PropertyForm } from "../operations/PropertyForm";
import { LibraryScreenForm } from "../chemistry/LibraryScreenForm";
import { StateForm } from "../chemistry/StateForm";
import "./utility-task.css";

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
};

/** New tasks replace the whole session, including outstanding template intent. */
export function UtilityTask(props: UtilityTaskProps) {
  const [generation, setGeneration] = useState(0);
  return (
    <UtilityTaskSession
      key={props.tool + ":" + generation}
      {...props}
      onReset={() => setGeneration((current) => current + 1)}
    />
  );
}

function UtilityTaskSession({
  tool,
  language,
  onCreated,
  onReset,
}: UtilityTaskProps & { onReset(): void }) {
  const { capability, Form } = utilities[tool];
  const [example, setExample] = useState<PreparedExample | null>(null);
  const [revision, setRevision] = useState(0);
  const [previewing, setPreviewing] = useState(false);
  const [completed, setCompleted] = useState(false);
  function replace(value: PreparedExample | null) {
    setExample(value);
    setRevision((current) => current + 1);
    setCompleted(false);
  }
  return (
    <section className="molecular-utility">
      <ExampleActions
        capability={capability}
        language={language}
        onLoad={replace}
        onClear={() => replace(null)}
        onPreviewChange={setPreviewing}
      />
      <div className="utility-task-form" hidden={previewing}>
        {completed && !example && (
          <div className="utility-toolbar">
            <button
              type="button"
              className="secondary-button"
              onClick={onReset}
            >
              {language === "zh" ? "新建任务" : "New task"}
            </button>
          </div>
        )}
        <ExampleContext.Provider
          key={revision}
          value={example?.module.capability_id === capability ? example : null}
        >
          <Form
            language={language}
            {...(tool === "brain" ? { focus: "brain" as const } : {})}
            onCreated={(job) => {
              setCompleted(true);
              onCreated(job);
            }}
          />
        </ExampleContext.Provider>
      </div>
    </section>
  );
}
