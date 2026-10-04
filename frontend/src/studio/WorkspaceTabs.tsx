import type { ReactNode } from "react";
export interface WorkspaceTab {
  id: string;
  label: string;
}
export function WorkspaceTabs({
  label,
  tabs,
  value,
  onChange,
  children,
}: {
  label: string;
  tabs: readonly WorkspaceTab[];
  value: string;
  onChange(value: string): void;
  children: ReactNode;
}) {
  return (
    <section className="combined-workspace">
      <div className="segmented workspace-tabs" role="group" aria-label={label}>
        {tabs.map((tab) => (
          <button
            type="button"
            key={tab.id}
            aria-pressed={value === tab.id}
            className={value === tab.id ? "selected" : ""}
            onClick={() => onChange(tab.id)}
          >
            {tab.label}
          </button>
        ))}
      </div>
      {children}
    </section>
  );
}
