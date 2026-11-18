import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { MoreOutlined, SettingOutlined } from "@ant-design/icons";
import "./viewer-tool-group.css";

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
  const panel = useId();

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
      onBlur={(event) => {
        if (
          event.relatedTarget &&
          !event.currentTarget.contains(event.relatedTarget)
        )
          setOpen(false);
      }}
      onKeyDown={(event) => {
        if (
          open &&
          event.key === "Escape" &&
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
