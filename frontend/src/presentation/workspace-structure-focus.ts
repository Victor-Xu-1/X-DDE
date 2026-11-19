const heightProperty = "--focused-structure-height";
const sceneSelector =
  ".viewer-panel > .molecular-stage, .simulation-molecular-viewport > .simulation-webgl";

type SceneLayout = { view: HTMLElement; stages: HTMLElement[] };

function sceneLayout(target: HTMLElement): SceneLayout | null {
  const view = target.querySelector<HTMLElement>(
    ":scope > .structure-workbench-view",
  );
  if (!view) return null;
  const stages = [...view.querySelectorAll<HTMLElement>(sceneSelector)].filter(
    (stage) =>
      !stage.closest("[hidden]") &&
      (typeof stage.checkVisibility !== "function" || stage.checkVisibility()),
  );
  if (stages.length === 1) return { view, stages };
  if (stages.length !== 2) return null;
  const group = stages[0].closest("[data-structure-focus-group]");
  return group && view.contains(group) && group.contains(stages[1])
    ? { view, stages }
    : null;
}

/** Fit the existing canvas or comparison group without replacing a renderer. */
export function createStructureFocus(target: HTMLElement, notify: () => void) {
  const desktop = window.matchMedia?.("(min-width: 1001px)");
  let scene: SceneLayout | null = null;
  let returnToSplit: (() => void) | undefined;
  let observer: ResizeObserver | undefined;
  let request = 0;

  function fit() {
    request = 0;
    if (!scene || !returnToSplit) return;
    const { view, stages } = scene;
    const base = view.getBoundingClientRect().top - view.scrollTop;
    const space = view.clientHeight;
    const heights = stages.map(
      (stage) =>
        Math.max(
          260,
          Math.floor(space - stage.getBoundingClientRect().top + base),
        ) + "px",
    );
    stages.forEach((stage, index) => {
      if (stage.style.getPropertyValue(heightProperty) !== heights[index])
        stage.style.setProperty(heightProperty, heights[index]);
    });
  }
  function schedule() {
    if (returnToSplit && !request) request = requestAnimationFrame(fit);
  }
  function disconnect() {
    cancelAnimationFrame(request);
    request = 0;
    observer?.disconnect();
    observer = undefined;
    scene?.stages.forEach((stage) =>
      stage.style.removeProperty(heightProperty),
    );
  }
  function observe() {
    if (!scene || !returnToSplit) return;
    if (typeof ResizeObserver === "function") {
      observer = new ResizeObserver(schedule);
      observer.observe(scene.view);
      for (const stage of scene.stages)
        if (stage.parentElement) observer.observe(stage.parentElement);
    }
    fit();
  }
  function restore() {
    if (!returnToSplit) return;
    disconnect();
    returnToSplit();
    returnToSplit = undefined;
  }
  function refresh() {
    const next = desktop?.matches ? sceneLayout(target) : null;
    if (
      next === scene ||
      (next &&
        scene &&
        next.view === scene.view &&
        next.stages.length === scene.stages.length &&
        next.stages.every((stage, index) => stage === scene?.stages[index]))
    ) {
      schedule();
      return;
    }
    if (!next || next.view !== scene?.view) restore();
    else if (returnToSplit) disconnect();
    scene = next;
    observe();
    notify();
  }
  function toggle() {
    if (returnToSplit) restore();
    else {
      if (!scene) return;
      const { view } = scene;
      const scroll = [
        view,
        ...target.querySelectorAll<HTMLElement>(
          ":scope > :is(.structure-workbench-details, .structure-workbench-sequence)",
        ),
      ].map((pane) => ({ pane, top: pane.scrollTop, left: pane.scrollLeft }));
      target.dataset.workspaceFocus = "true";
      view.scrollTop = 0;
      returnToSplit = () => {
        delete target.dataset.workspaceFocus;
        for (const { pane, top, left } of scroll) {
          pane.scrollTop = top;
          pane.scrollLeft = left;
        }
      };
      observe();
    }
    notify();
  }
  desktop?.addEventListener("change", refresh);
  return {
    get available() {
      return Boolean(scene);
    },
    refresh,
    toggle,
    dispose() {
      desktop?.removeEventListener("change", refresh);
      restore();
    },
  };
}
