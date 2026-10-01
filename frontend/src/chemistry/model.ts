import { defaults } from "./generated";
import type { StateOptions } from "./types";
export type PreparationChoice = "supplied" | "physiological" | "explore";
export function optionsFor(choice: PreparationChoice): StateOptions {
  return choice === "supplied"
    ? {
        ...defaults,
        force_field: "MMFF94s" as const,
        protonation: false,
        tautomers: false,
        stereoisomers: false,
        max_states: 1,
        conformers_per_state: 10,
        max_records: 16,
      }
    : choice === "explore"
      ? {
          ...defaults,
          force_field: "MMFF94s" as const,
          ph_min: 5,
          ph_max: 9,
          max_states: 32,
          conformers_per_state: 4,
          max_records: 128,
        }
      : {
          ...defaults,
          force_field: "MMFF94s" as const,
          ph_min: 6.8,
          ph_max: 7.8,
        };
}
