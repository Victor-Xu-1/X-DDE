import { createStructureFocus } from "./workspace-structure-focus";

/** One presentation session; the original scene and React tree never move. */
type ExpandedWorkspace = {
  target: HTMLElement;
  close(): void;
  focus: ReturnType<typeof createStructureFocus>;
};
let current: ExpandedWorkspace | null = null;
export const expansionChange = "workspace-expansion-change";

const focusable =
  'button:not([disabled]),a[href],summary,input:not([disabled]),select:not([disabled]),textarea:not([disabled]),iframe,[tabindex]:not([tabindex="-1"])';

function visible(node: HTMLElement) {
  if (
    !node.isConnected ||
    node.closest('[hidden],[inert],[aria-hidden="true"]')
  )
    return false;
  for (
    let ancestor: HTMLElement | null = node;
    ancestor;
    ancestor = ancestor.parentElement
  ) {
    if (
      ancestor instanceof HTMLDetailsElement &&
      !ancestor.open &&
      !ancestor.querySelector(":scope > summary")?.contains(node)
    )
      return false;
    const style = getComputedStyle(ancestor);
    if (style.display === "none" || style.visibility === "hidden") return false;
  }
  return true;
}

export function expandedWorkspace() {
  return current?.target ?? null;
}

export function canFocusWorkspace(target: HTMLElement | null) {
  return Boolean(
    current && current.target === target && current.focus.available,
  );
}

export function toggleWorkspaceFocus(target: HTMLElement | null) {
  if (current && current.target === target) current.focus.toggle();
}

function outsideBranches(target: HTMLElement) {
  const branches: HTMLElement[] = [];
  for (let child: HTMLElement | null = target; child?.parentElement;) {
    const parent: HTMLElement = child.parentElement;
    for (const sibling of parent.children)
      if (sibling !== child && sibling instanceof HTMLElement)
        branches.push(sibling);
    child = parent;
    if (child === document.body) break;
  }
  return branches;
}

export function toggleWorkspace(
  target: HTMLElement,
  trigger: HTMLButtonElement,
  label: string,
) {
  if (current?.target === target) {
    current.close();
    return;
  }
  current?.close();
  // Popover puts the SAME element in the top layer without reparenting its iframe.
  // It needs neither browser fullscreen permission nor a second renderer.
  if (typeof target.showPopover !== "function")
    throw new Error("Expanded view is unavailable.");
  const attributes = [
    "popover",
    "role",
    "aria-modal",
    "aria-label",
    "tabindex",
  ];
  const previous = attributes.map(
    (name) => [name, target.getAttribute(name)] as const,
  );
  const inert = outsideBranches(target).map(
    (node) => [node, node.hasAttribute("inert")] as const,
  );
  const overflow = document.body.style.overflow;
  const rootOverflow = document.documentElement.style.overflow;
  const scroll = [] as { node: HTMLElement; top: number; left: number }[];
  for (let node = target.parentElement; node; node = node.parentElement)
    scroll.push({ node, top: node.scrollTop, left: node.scrollLeft });
  const frameDocuments = new Map<HTMLIFrameElement, Document>();
  const frames = new Set<HTMLIFrameElement>();
  let structureFocus: ExpandedWorkspace["focus"] | undefined;
  let closed = false;
  const choices = () =>
    [...target.querySelectorAll<HTMLElement>(focusable)].filter(
      (node) =>
        visible(node) &&
        (typeof node.checkVisibility !== "function" || node.checkVisibility()),
    );
  function focus(fallback?: Element | null) {
    const replacement =
      fallback instanceof HTMLElement &&
      target.contains(fallback) &&
      !fallback.hasAttribute("data-workspace-expand") &&
      visible(fallback)
        ? fallback
        : choices()[0];
    (visible(trigger) ? trigger : (replacement ?? target)).focus({
      preventScroll: true,
    });
  }
  function close() {
    if (closed) return;
    closed = true;
    const activeBeforeClose = document.activeElement;
    current = null;
    observer.disconnect();
    structureFocus?.dispose();
    document.removeEventListener("keydown", keydown, true);
    document.removeEventListener("focusin", containFocus);
    target.removeEventListener("toggle", nativeToggle);
    for (const frame of frames) frame.removeEventListener("load", connectFrame);
    for (const doc of frameDocuments.values())
      doc.removeEventListener("keydown", keydown, true);
    try {
      target.hidePopover();
    } catch {
      // A browser-initiated close may already have removed it from the top layer.
    }
    delete target.dataset.workspaceExpanded;
    for (const [name, value] of previous)
      if (value === null) target.removeAttribute(name);
      else target.setAttribute(name, value);
    for (const [node, value] of inert) node.toggleAttribute("inert", value);
    document.body.style.overflow = overflow;
    document.documentElement.style.overflow = rootOverflow;
    for (const { node, top, left } of scroll) {
      node.scrollTop = top;
      node.scrollLeft = left;
    }
    document.dispatchEvent(new Event(expansionChange));
    if (visible(target)) focus(activeBeforeClose);
    else
      [...document.querySelectorAll<HTMLElement>(focusable)]
        .find(visible)
        ?.focus({ preventScroll: true });
  }
  function nestedDialog() {
    return [...document.querySelectorAll("dialog[open]")].some(
      (dialog) => !dialog.contains(target),
    );
  }
  function keydown(event: KeyboardEvent) {
    if (
      event.defaultPrevented ||
      event.isComposing ||
      event.altKey ||
      event.ctrlKey ||
      event.metaKey ||
      nestedDialog()
    )
      return;
    if (event.key === "Escape") {
      // An open visible child disclosure handles Escape before its workspace.
      const localScope =
        event.target instanceof Element
          ? event.target.closest("[data-workspace-escape-scope]")
          : null;
      const localTrigger = localScope?.querySelector<HTMLElement>(
        ':scope > [aria-expanded="true"]',
      );
      if (
        localTrigger &&
        target.contains(localTrigger) &&
        visible(localTrigger)
      )
        return;
      event.preventDefault();
      event.stopPropagation();
      close();
    } else if (event.key === "Tab" && event.currentTarget !== document) {
      const doc = event.currentTarget as Document;
      const entry = [...frameDocuments].find(
        ([, candidate]) => candidate === doc,
      );
      if (!entry) return;
      const inside = [...doc.querySelectorAll<HTMLElement>(focusable)].filter(
        (node) =>
          typeof node.checkVisibility !== "function" || node.checkVisibility(),
      );
      if (
        !inside.length ||
        doc.activeElement === (event.shiftKey ? inside[0] : inside.at(-1))
      ) {
        const nodes = choices(),
          index = nodes.indexOf(entry[0]);
        const next =
          nodes[
            (index + (event.shiftKey ? nodes.length - 1 : 1)) % nodes.length
          ];
        event.preventDefault();
        (next ?? target).focus({ preventScroll: true });
      }
    } else if (event.key === "Tab") {
      const nodes = choices(),
        first = nodes[0],
        last = nodes.at(-1);
      if (!first || (event.shiftKey && document.activeElement === first)) {
        event.preventDefault();
        (last ?? target).focus({ preventScroll: true });
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus({ preventScroll: true });
      }
    }
  }
  function containFocus(event: FocusEvent) {
    if (!target.contains(event.target as Node) && !nestedDialog()) focus();
  }
  function nativeToggle(event: Event) {
    if (event.target === target && (event as ToggleEvent).newState === "closed")
      close();
  }
  function connectFrame() {
    for (const frame of frames)
      if (!target.contains(frame)) {
        frame.removeEventListener("load", connectFrame);
        frameDocuments
          .get(frame)
          ?.removeEventListener("keydown", keydown, true);
        frameDocuments.delete(frame);
        frames.delete(frame);
      }
    for (const frame of target.querySelectorAll("iframe")) {
      if (!frames.has(frame)) {
        frames.add(frame);
        frame.addEventListener("load", connectFrame);
      }
      try {
        const doc = frame.contentDocument;
        if (doc && doc !== frameDocuments.get(frame)) {
          frameDocuments
            .get(frame)
            ?.removeEventListener("keydown", keydown, true);
          doc.addEventListener("keydown", keydown, true);
          frameDocuments.set(frame, doc);
        }
      } catch {
        // Cross-origin documents keep their own keyboard boundary.
      }
    }
  }
  const observer = new MutationObserver((records) => {
    if (!visible(target)) close();
    else {
      connectFrame();
      if (records.some((record) => target.contains(record.target))) {
        const triggers = target.querySelectorAll<HTMLElement>(
          "[data-workspace-expand]",
        );
        if (![...triggers].some(visible)) {
          close();
          return;
        }
        structureFocus?.refresh();
      }
    }
  });
  try {
    target.setAttribute("popover", "manual");
    target.setAttribute("role", "dialog");
    target.setAttribute("aria-modal", "true");
    target.setAttribute("aria-label", label);
    target.setAttribute("tabindex", "-1");
    target.dataset.workspaceExpanded = "true";
    target.showPopover();
    structureFocus = createStructureFocus(target, () => {
      if (
        !structureFocus?.available &&
        document.activeElement?.classList.contains("workspace-structure-focus")
      )
        focus();
      document.dispatchEvent(new Event(expansionChange));
    });
    current = { target, close, focus: structureFocus };
    for (const [node] of inert) node.setAttribute("inert", "");
    document.body.style.overflow = "hidden";
    document.documentElement.style.overflow = "hidden";
    document.addEventListener("keydown", keydown, true);
    document.addEventListener("focusin", containFocus);
    target.addEventListener("toggle", nativeToggle);
    observer.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ["hidden", "aria-hidden", "class", "style"],
    });
    connectFrame();
    structureFocus.refresh();
    document.dispatchEvent(new Event(expansionChange));
    focus();
  } catch (error) {
    close();
    throw error;
  }
}
