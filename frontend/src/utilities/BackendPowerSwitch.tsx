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
  onToggle(): void;
}) {
  const description = useId();
  return (
    <div className="compute-switch runtime-switch" data-engine={id}>
      <span className="runtime-switch-label">
        {showName && <span title={name}>{name}</span>}
        <span className="runtime-switch-status">
          <small id={description} aria-live="polite">
            {status}
          </small>
          {setup}
        </span>
      </span>
      <button
        type="button"
        role="switch"
        aria-label={name}
        aria-describedby={description}
        aria-checked={enabled}
        aria-disabled={pending || undefined}
        disabled={disabled}
        title={hint}
        onClick={pending ? undefined : onToggle}
      >
        <i aria-hidden="true" />
      </button>
    </div>
  );
}
