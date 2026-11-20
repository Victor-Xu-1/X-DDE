import type { ReactNode } from "react";
import "./molecule-result-toolbar.css";

export function MoleculeResultToolbar({
  name,
  status,
  children,
}: {
  name: string;
  status?: ReactNode;
  children?: ReactNode;
}) {
  return (
    <div className="molecule-result-toolbar">
      <div className="molecule-result-identity">
        <h3 title={name}>{name}</h3>
        {status && <p role="status">{status}</p>}
      </div>
      {children && <div className="molecule-result-actions">{children}</div>}
    </div>
  );
}
