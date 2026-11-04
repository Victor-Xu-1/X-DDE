import type { ReactNode, Ref } from "react";
import "./structure-workbench.css";

/** One molecular workspace: the live view leads; data and actions follow it. */
export function StructureWorkbench({
  preview,
  sequenceHostRef,
  children,
}: {
  preview: ReactNode;
  sequenceHostRef?: Ref<HTMLDivElement>;
  children: ReactNode;
}) {
  return (
    <div
      className={
        "structure-workbench" +
        (preview === null || preview === undefined || preview === false
          ? " is-text-only"
          : "")
      }
    >
      <div className="structure-workbench-view">{preview}</div>
      <div className="structure-workbench-details">{children}</div>
      {sequenceHostRef && (
        <div className="structure-workbench-sequence" ref={sequenceHostRef} />
      )}
    </div>
  );
}
