import type { ReactNode } from "react";
import "./structure-workbench.css";

/** One molecular workspace: the live view leads; data and actions follow it. */
export function StructureWorkbench({
  preview,
  children,
}: {
  preview: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="structure-workbench">
      <div className="structure-workbench-view">{preview}</div>
      <div className="structure-workbench-details">{children}</div>
    </div>
  );
}
