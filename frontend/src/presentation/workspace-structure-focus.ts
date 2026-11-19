const heightProperty = "--focused-structure-height";

function singleScene(target: HTMLElement) {
  const view = target.querySelector<HTMLElement>(
    ":scope > .structure-workbench-view",
  );
  const scenes = Array.from(
    view?.querySelectorAll<HTMLElement>(
      ".molecular-stage, .simulation-webgl",
    ) ?? [],
  ).filter(
    (scene) =>
      !scene.closest("[hidden]") &&
      (typeof scene.checkVisibility !== "function" || scene.checkVisibility()),
  );
  const [stage] = scenes;
  return view &&
    scenes.length === 1 &&
    stage.matches(".viewer-panel > .molecular-stage")
    ? { view, stage }
    : null;
}

/** Expand the live canvas within the available pane without moving its iframe. */
export function createStructureFocus(target: HTMLElement, notify: () => void) {
  const desktop = window.matchMedia?.("(min-width: 1001px)");
  let scene: ReturnType<typeof singleScene> = null;
  let release: (() => void) | undefined;
  let request = 0;

  function fit() {
    request = 0;
    if (!scene || !release) return;
    const { view, stage } = scene;
    const offset =
      stage.getBoundingClientRect().top -
      view.getBoundingClientRect().top +
      view.scrollTop;
    const value = Math.max(260, Math.floor(view.clientHeight - offset)) + "px";
    if (stage.style.getPropertyValue(heightProperty) !== value)
      stage.style.setProperty(heightProperty, value);
  }
  function schedule() {
    if (release && !request) request = requestAnimationFrame(fit);
  }
  function restore() {
    release?.();
    release = undefined;
    cancelAnimationFrame(request);
    request = 0;
  }
  function refresh() {
    const next = desktop?.matches ? singleScene(target) : null;
    if (next?.stage !== scene?.stage || next?.view !== scene?.view) {
      restore();
      scene = next || null;
      notify();
    }
    schedule();
  }
  function toggle() {
    if (release) restore();
    else {
      if (!scene) return;
      const { view, stage } = scene;
      const scroll = [
        view,
        ...target.querySelectorAll<HTMLElement>(
          ":scope > :is(.structure-workbench-details, .structure-workbench-sequence)",
        ),
      ].map((pane) => ({ pane, top: pane.scrollTop, left: pane.scrollLeft }));
      const observer =
        typeof ResizeObserver === "function"
          ? new ResizeObserver(schedule)
          : null;
      target.dataset.workspaceFocus = "true";
      view.scrollTop = 0;
      release = () => {
        observer?.disconnect();
        delete target.dataset.workspaceFocus;
        stage.style.removeProperty(heightProperty);
        for (const { pane, top, left } of scroll) {
          pane.scrollTop = top;
          pane.scrollLeft = left;
        }
      };
      observer?.observe(view);
      observer?.observe(stage.parentElement!);
      fit();
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
