import type { useTaskReadiness } from "../guided/useTaskReadiness";

type Readiness = ReturnType<typeof useTaskReadiness>;

/** Only the current research plan determines which installed environments matter. */
export function screeningReadiness(
  retrieval: Readiness,
  docking: Readiness,
  chemistry: Readiness,
  plan: { dock: boolean; importLibrary: boolean },
) {
  const required = [
    retrieval,
    ...(plan.dock ? [docking] : []),
    ...(plan.importLibrary ? [chemistry] : []),
  ];
  return {
    ready: required.some((value) => value.ready === false)
      ? false
      : required.some((value) => value.ready === undefined)
        ? undefined
        : true,
    error: required.find((value) => value.error)?.error ?? "",
    recheck: () => required.forEach((value) => value.recheck()),
  };
}
