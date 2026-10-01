import { expect, it } from "vitest";
import { optionsFor } from "./model";
it("keeps each guided preparation inside an explicit budget and preserves input chemistry by default", () => {
  const input = optionsFor("supplied");
  expect(input.protonation).toBe(false);
  expect(input.tautomers).toBe(false);
  expect(input.stereoisomers).toBe(false);
  for (const choice of ["supplied", "physiological", "explore"] as const) {
    const v = optionsFor(choice);
    expect(
      v.max_states * Math.max(1, v.conformers_per_state),
    ).toBeLessThanOrEqual(v.max_records);
    expect(v.ph_min).toBeLessThanOrEqual(v.ph_max);
  }
});
