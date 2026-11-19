import { useId, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { QuestionCircleOutlined } from "@ant-design/icons";
export function Hint({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  const id = useId();
  const [position, setPosition] = useState<{
    left: number;
    top: number;
    host: HTMLElement;
  } | null>(null);
  function open(target: HTMLElement) {
    const r = target.getBoundingClientRect();
    const workspace = target.closest<HTMLElement>(
      '[data-workspace-expanded="true"]',
    );
    const bounds = workspace?.getBoundingClientRect() ?? {
      left: 0,
      top: 0,
      right: window.innerWidth,
      bottom: window.innerHeight,
    };
    setPosition({
      left: Math.max(bounds.left + 8, Math.min(r.left, bounds.right - 288)),
      top: Math.max(
        bounds.top + 8,
        Math.min(r.bottom + 8, bounds.bottom - 145),
      ),
      host: workspace ?? document.body,
    });
  }
  return (
    <span
      className="help-trigger"
      onMouseEnter={(e) => open(e.currentTarget)}
      onMouseLeave={(e) => {
        if (!e.currentTarget.contains(document.activeElement))
          setPosition(null);
      }}
    >
      <button
        type="button"
        aria-label={label}
        aria-describedby={position ? id : undefined}
        onFocus={(e) => open(e.currentTarget)}
        onBlur={() => setPosition(null)}
        onClick={(e) => open(e.currentTarget)}
        onKeyDown={(e) => {
          if (e.key === "Escape") setPosition(null);
        }}
      >
        <QuestionCircleOutlined />
      </button>
      {position &&
        createPortal(
          <span
            role="tooltip"
            id={id}
            className="help-tooltip"
            style={{ left: position.left, top: position.top }}
          >
            {children}
          </span>,
          position.host,
        )}
    </span>
  );
}
