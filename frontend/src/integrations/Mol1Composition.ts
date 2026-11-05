import { useState, type SetStateAction } from "react";
import type { Component } from "../types";
import type { CovalentBond } from "../operations/types";
import type { Mol1Settings } from "./mol1-settings";

interface Composition {
  components: Component[];
  settings: Mol1Settings;
  bonds: CovalentBond[];
}

function apply<T>(action: SetStateAction<T>, previous: T): T {
  return typeof action === "function"
    ? (action as (value: T) => T)(previous)
    : action;
}

/** One parent authority for components and their dependent Mol-1 setup. */
export function useMol1Composition(initial: () => Composition) {
  const [state, setState] = useState(initial);
  return {
    ...state,
    setComponents(action: SetStateAction<Component[]>) {
      setState((previous) => ({
        ...previous,
        components: apply(action, previous.components),
      }));
    },
    setSettings(action: SetStateAction<Mol1Settings>) {
      setState((previous) => ({
        ...previous,
        settings: apply(action, previous.settings),
      }));
    },
    setBonds(action: SetStateAction<CovalentBond[]>) {
      setState((previous) => ({
        ...previous,
        bonds: apply(action, previous.bonds),
      }));
    },
    editComponents(action: SetStateAction<Component[]>) {
      setState((previous) => {
        const components = apply(action, previous.components);
        if (components === previous.components) return previous;
        return {
          components,
          bonds: [],
          settings: {
            ...previous.settings,
            use_rna_msa:
              previous.settings.use_rna_msa &&
              components.some((item) => item.kind === "rna"),
            use_template:
              previous.settings.use_template &&
              components.some((item) => item.kind === "protein"),
          },
        };
      });
    },
  };
}
