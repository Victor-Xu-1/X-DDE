import { useId } from "react";
export function ChoiceCards<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T;
  options: readonly { value: T; title: string; note?: string; hint?: string }[];
  onChange(value: T): void;
}) {
  const id = useId();
  return (
    <div role="radiogroup" aria-label={label} className="questionnaire-choices">
      {options.map((option) => (
        <label
          key={option.value}
          className={value === option.value ? "selected" : ""}
          title={option.hint ?? option.note}
        >
          <input
            type="radio"
            name={id}
            checked={value === option.value}
            aria-label={option.title}
            onChange={() => onChange(option.value)}
          />
          <span>
            <strong>{option.title}</strong>
            {option.note && <small>{option.note}</small>}
          </span>
        </label>
      ))}
    </div>
  );
}
