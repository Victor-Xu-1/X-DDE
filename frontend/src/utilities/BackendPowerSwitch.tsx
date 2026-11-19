import { useId, type ReactNode } from "react";

export function BackendPowerSwitch({
  id,
  name,
  status,
  showName = true,
  enabled,
  disabled,
  pending = false,
  hint,
  setup,
  context,
  current,
  onToggle,
}: {
  id: string;
  name: string;
  status: string;
  showName?: boolean;
  enabled: boolean;
  disabled: boolean;
  pending?: boolean;
  hint?: string;
  setup?: ReactNode;
  context?: ReactNode;
  current?: boolean;
  onToggle?(): void;
}) {
  const description = useId();
  return (
    <div
      className="compute-switch runtime-switch"
      data-engine={id}
      data-current-backend={current || undefined}
    >
      <span className="runtime-switch-label">
        {showName && <span title={name}>{name}</span>}
        <span className="runtime-switch-status">
          <small id={description} title={status} aria-live="polite">
            {status}
          </small>
          {setup}
        </span>
        {context}
      </span>
      <button
        type="button"
        role="switch"
        aria-label={name}
        aria-describedby={description}
        aria-checked={enabled}
        aria-disabled={pending || undefined}
        disabled={disabled || !onToggle}
        title={hint ?? `${name} · ${status}`}
        onClick={pending ? undefined : onToggle}
      >
        <i aria-hidden="true" />
      </button>
    </div>
  );
}
