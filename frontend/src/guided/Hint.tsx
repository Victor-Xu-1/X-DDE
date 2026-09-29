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
  } | null>(null);
  function open(target: HTMLElement) {
    const r = target.getBoundingClientRect();
    setPosition({
      left: Math.max(8, Math.min(r.left, window.innerWidth - 288)),
      top: Math.max(8, Math.min(r.bottom + 8, window.innerHeight - 145)),
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
            style={position}
          >
            {children}
          </span>,
          document.body,
        )}
    </span>
  );
}
