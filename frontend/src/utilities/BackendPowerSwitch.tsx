import { useId } from "react";

export function BackendPowerSwitch({
  id,
  name,
  status,
  enabled,
  disabled,
  hint,
  onToggle,
}: {
  id: string;
  name: string;
  status: string;
  enabled: boolean;
  disabled: boolean;
  hint?: string;
  onToggle(): void;
}) {
  const description = useId();
  return (
    <div className="compute-switch runtime-switch" data-engine={id}>
      <span className="runtime-switch-label">
        <span title={name}>{name}</span>
        <small id={description} aria-live="polite">
          {status}
        </small>
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
