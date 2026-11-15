import { useState, type SetStateAction } from "react";
import { defaults } from "../form-model";
import { componentsFor, kindFor, type TaskKind } from "../guided/presets";
import type { Component, Parameters, Prediction } from "../types";
import type { OpenDdeDraft, OpenDdeDraftState } from "./opendde-draft";
import {
  integerLimits,
  readIntegerList,
  type IntegerField,
} from "./integer-list-model";

export const emptyOpenDdeEditor = (): OpenDdeDraftState => ({
  name: "",
  kind: "complex",
  components: componentsFor("complex", []),
  workflows: {},
  parameters: { ...defaults, model: "standard" },
  bonds: [],
  expert: false,
  input_references: [],
  integer_text: {},
});
function fromPrediction(value: Prediction): OpenDdeDraftState {
  return {
    ...emptyOpenDdeEditor(),
    name: value.name,
    kind: kindFor(value.components, value.parameters.model),
    components: structuredClone(value.components),
    parameters: structuredClone(value.parameters),
    bonds: structuredClone(value.covalent_bonds ?? []),
    input_references: structuredClone(value.scientific_inputs ?? []),
  };
}
/** One editor state owns the visible form and its lossless saved snapshot. */
export function useOpenDdeEditor(
  initial: OpenDdeDraft | null,
  request?: Prediction | null,
) {
  const [state, setState] = useState<OpenDdeDraftState>(() =>
    initial
      ? structuredClone(initial.state)
      : request
        ? fromPrediction(request)
        : emptyOpenDdeEditor(),
  );
  const [revision, setRevision] = useState(0);
  const patch = (value: Partial<OpenDdeDraftState>) =>
    setState((current) => ({ ...current, ...value }));
  function changeComponents(value: SetStateAction<Component[]>) {
    setState((current) => ({
      ...current,
      components:
        typeof value === "function" ? value(current.components) : value,
    }));
  }
  function chooseKind(kind: TaskKind) {
    setState((current) =>
      kind === current.kind
        ? current
        : {
            ...current,
            kind,
            workflows: {
              ...current.workflows,
              [current.kind]: current.components,
            },
            components:
              current.workflows[kind] ??
              componentsFor(kind, current.components),
            bonds: [],
            parameters: {
              ...current.parameters,
              model: kind === "antibody" ? "abag" : "standard",
            },
          },
    );
  }
  function changeParameters(parameters: Parameters) {
    setState((current) => {
      const integer_text = { ...current.integer_text };
      for (const field of ["additional_seeds", "gpu_ids"] as const) {
        const oldValues = current.parameters[field] ?? [],
          newValues = parameters[field] ?? [];
        const changed =
          JSON.stringify(oldValues) !== JSON.stringify(newValues) ||
          (field === "gpu_ids" &&
            current.parameters.device !== parameters.device);
        if (!changed || integer_text[field] === undefined) continue;
        const { max, count } = integerLimits[field];
        const parsed = readIntegerList(integer_text[field]!, max, count);
        if (
          !parsed.valid ||
          JSON.stringify(parsed.values) !== JSON.stringify(newValues)
        )
          delete integer_text[field];
      }
      return { ...current, parameters, integer_text };
    });
  }
  function changeIntegerText(field: IntegerField, raw: string) {
    setState((current) => ({
      ...current,
      integer_text: { ...current.integer_text, [field]: raw },
    }));
  }
  function replace(next: OpenDdeDraftState) {
    setState(next);
    setRevision((current) => current + 1);
  }
  return {
    state,
    revision,
    patch,
    changeComponents,
    chooseKind,
    changeParameters,
    changeIntegerText,
    snapshot: {
      ...state,
      workflows: { ...state.workflows, [state.kind]: state.components },
    },
    clear: () => replace(emptyOpenDdeEditor()),
    load: (value: Prediction) => replace(fromPrediction(value)),
  };
}
