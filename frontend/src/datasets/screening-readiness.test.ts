import { expect, it, vi } from "vitest";
import { screeningReadiness } from "./screening-readiness";

function environment(ready: boolean | undefined, error = "") {
  return { ready, error, recheck: vi.fn() };
}
it("keeps indexed retrieval usable when optional docking and import tools are unavailable", () => {
  const retrieval = environment(true),
    docking = environment(false, "Docking unavailable"),
    chemistry = environment(false);
  const state = screeningReadiness(retrieval, docking, chemistry, {
    dock: false,
    importLibrary: false,
  });
  expect(state.ready).toBe(true);
  expect(state.error).toBe("");
  state.recheck();
  expect(retrieval.recheck).toHaveBeenCalledOnce();
  expect(docking.recheck).not.toHaveBeenCalled();
  expect(chemistry.recheck).not.toHaveBeenCalled();
});
it.each([
  { dock: true, importLibrary: false },
  { dock: false, importLibrary: true },
  { dock: true, importLibrary: true },
])(
  "blocks a plan with an unavailable required environment and rechecks exactly its choices: %s",
  (plan) => {
    const retrieval = environment(true),
      docking = environment(false),
      chemistry = environment(false);
    const state = screeningReadiness(retrieval, docking, chemistry, plan);
    expect(state.ready).toBe(false);
    state.recheck();
    expect(retrieval.recheck).toHaveBeenCalledOnce();
    expect(docking.recheck).toHaveBeenCalledTimes(plan.dock ? 1 : 0);
    expect(chemistry.recheck).toHaveBeenCalledTimes(plan.importLibrary ? 1 : 0);
  },
);
it("distinguishes a pending required environment from a confirmed missing environment", () => {
  const state = screeningReadiness(
    environment(true),
    environment(undefined),
    environment(false),
    { dock: true, importLibrary: false },
  );
  expect(state.ready).toBeUndefined();
  expect(state.error).toBe("");
});
it("reports a required transport failure without claiming that optional tools are missing", () => {
  const state = screeningReadiness(
    environment(true),
    environment(false, "The calculation environment could not be checked."),
    environment(false, "Optional import unavailable"),
    { dock: true, importLibrary: false },
  );
  expect(state.ready).toBe(false);
  expect(state.error).toBe("The calculation environment could not be checked.");
});
