import type { ReactNode } from "react";
import { isRowSelectionTarget } from "./table-selection";
import "./result-row.css";

/** One selection policy for array, native-structure and server-paged result tables. */
export function ResultRow({
  children,
  selected = false,
  onSelect,
  disabled = false,
  className = "",
}: {
  children: ReactNode;
  selected?: boolean;
  onSelect?(): void;
  disabled?: boolean;
  className?: string;
}) {
  const selectable = !!onSelect && !disabled;
  return (
    <tr
      className={[
        "result-selection-row",
        className,
        selected ? "is-selected" : "",
        selectable ? "is-selectable" : "",
      ]
        .filter(Boolean)
        .join(" ")}
      aria-selected={onSelect ? selected : undefined}
      tabIndex={selectable ? 0 : undefined}
      onClick={
        selectable
          ? (event) => {
              if (
                !event.defaultPrevented &&
                isRowSelectionTarget(event.target, event.currentTarget)
              )
                onSelect?.();
            }
          : undefined
      }
      onKeyDown={
        selectable
          ? (event) => {
              if (
                event.target === event.currentTarget &&
                (event.key === "Enter" || event.key === " ")
              ) {
                event.preventDefault();
                onSelect?.();
              }
            }
          : undefined
      }
    >
      {children}
    </tr>
  );
}
