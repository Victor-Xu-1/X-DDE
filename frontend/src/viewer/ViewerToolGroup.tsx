import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { MoreOutlined, SettingOutlined } from "@ant-design/icons";
import "./viewer-tool-group.css";

function displayed(element: HTMLElement) {
  return (
    element.getClientRects().length > 0 && (element.checkVisibility?.() ?? true)
  );
}

export function ViewerToolGroup({
  kind,
  label,
  children,
}: {
  kind: "actions" | "display";
  label: string;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const group = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const content = useRef<HTMLDivElement>(null);
  const lastFocused = useRef<HTMLElement | null>(null);
  const panel = useId();

  useEffect(() => {
    const button = trigger.current;
    const controls = content.current;
    if (!button || !controls) return;
    let compact = displayed(button);
    const observer = new ResizeObserver(() => {
      const next = displayed(button);
      if (next === compact) return;
      compact = next;
      if (!compact) setOpen(false);

      const previous = lastFocused.current;
      if (!previous || displayed(previous)) return;
      lastFocused.current = null;
      const active = button.ownerDocument.activeElement;
      if (active !== previous && active !== button.ownerDocument.body) return;
      const destination = compact
        ? button
        : Array.from(
            controls.querySelectorAll<HTMLElement>(
              "summary, button:enabled, select:enabled, input:enabled",
            ),
          ).find(displayed);
      destination?.focus({ preventScroll: true });
    });
    observer.observe(button);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!open) return;
    function dismiss(event: PointerEvent) {
      if (
        event.target instanceof Node &&
        !group.current?.contains(event.target)
      )
        setOpen(false);
    }
    document.addEventListener("pointerdown", dismiss);
    return () => document.removeEventListener("pointerdown", dismiss);
  }, [open]);

  return (
    <div
      ref={group}
      className={`viewer-tool-group is-${kind}`}
      data-open={open}
      data-workspace-escape-scope={open ? "" : undefined}
      onFocus={(event) => {
        if (event.target instanceof HTMLElement)
          lastFocused.current = event.target;
      }}
      onBlur={(event) => {
        const next = event.relatedTarget;
        if (next && event.currentTarget.contains(next)) return;
        // A control hidden by reflow can blur before the observer runs.
        if (
          (next && next !== event.currentTarget.ownerDocument.body) ||
          displayed(event.target)
        ) {
          lastFocused.current = null;
          setOpen(false);
        }
      }}
      onKeyDown={(event) => {
        if (
          open &&
          event.key === "Escape" &&
          trigger.current?.getClientRects().length &&
          !(
            event.target instanceof Element &&
            event.target.closest("dialog[open]")
          )
        ) {
          event.preventDefault();
          event.stopPropagation();
          setOpen(false);
          trigger.current?.focus({ preventScroll: true });
        }
      }}
    >
      <button
        ref={trigger}
        type="button"
        className="viewer-tool-trigger"
        aria-label={label}
        title={label}
        aria-expanded={open}
        aria-controls={panel}
        onClick={() => setOpen((value) => !value)}
      >
        {kind === "actions" ? (
          <MoreOutlined aria-hidden="true" />
        ) : (
          <SettingOutlined aria-hidden="true" />
        )}
      </button>
      <div
        ref={content}
        id={panel}
        className="viewer-tool-content"
        role="group"
        aria-label={label}
      >
        {children}
      </div>
    </div>
  );
}
