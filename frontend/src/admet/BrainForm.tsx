import { useState } from "react";
import type { Job, Language } from "../types";
import { ExampleActions } from "../examples/ExampleActions";
import { ExampleContext } from "../examples/context";
import type { PreparedExample } from "../examples/types";
import { AdmetForm } from "./AdmetForm";

/** Templates use the existing asset authority; navigation never enables the model. */
export function BrainForm(props: {
  language: Language;
  onCreated(job: Job): void;
}) {
  const [example, setExample] = useState<PreparedExample | null>(null);
  const [revision, setRevision] = useState(0);
  const [previewing, setPreviewing] = useState(false);
  function replace(value: PreparedExample | null) {
    setExample(value);
    setRevision((current) => current + 1);
  }
  return (
    <section className="brain-utility">
      <ExampleActions
        capability="admet.brain"
        language={props.language}
        onLoad={replace}
        onClear={() => replace(null)}
        onPreviewChange={setPreviewing}
      />
      <div hidden={previewing}>
        <ExampleContext.Provider
          key={revision}
          value={
            example?.module.capability_id === "admet.brain" ? example : null
          }
        >
          <AdmetForm {...props} focus="brain" />
        </ExampleContext.Provider>
      </div>
    </section>
  );
}
