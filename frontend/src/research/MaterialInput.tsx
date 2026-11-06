import type { ReactNode } from "react";
import type { AssetKind } from "../operations/types";
import { ChoiceCards } from "../guided/ChoiceCards";
import "./material-input.css";

/** Shared presentation only; each picker owns its source and verified selection. */
export function MaterialInput<T extends string>({
  label,
  kind,
  source,
  onSource,
  options,
  children,
}: {
  label: string;
  kind: AssetKind;
  source: T;
  onSource(value: T): void;
  options: readonly { value: T; title: string }[];
  children: ReactNode;
}) {
  return (
    <div
      className="reference-material"
      data-material-kind={kind}
      data-source-count={options.length}
    >
      <header className="reference-material-heading">
        <h3 className="input-purpose">{label}</h3>
        <ChoiceCards
          label={label}
          value={source}
          onChange={onSource}
          options={options}
        />
      </header>
      <div className="reference-material-body">{children}</div>
    </div>
  );
}
