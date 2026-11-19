import { useId, type ReactNode } from "react";

export function BackendPowerSwitch({
  id,
  name,
  status,
  enabled,
  disabled,
  hint,
  setup,
  onToggle,
}: {
  id: string;
  name: string;
  status: string;
  enabled: boolean;
  disabled: boolean;
  hint?: string;
  setup?: ReactNode;
  onToggle(): void;
}) {
  const description = useId();
  return (
    <div className="compute-switch runtime-switch" data-engine={id}>
      <span className="runtime-switch-label">
        <span title={name}>{name}</span>
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
        disabled={disabled}
        title={hint}
        onClick={onToggle}
      >
        <i aria-hidden="true" />
      </button>
    </div>
  );
}
