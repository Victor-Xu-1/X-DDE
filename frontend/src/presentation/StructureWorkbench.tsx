import type { ReactNode, Ref } from "react";
import "./structure-workbench.css";

/** One molecular workspace: the live view leads; data and actions follow it. */
export function StructureWorkbench({
  preview,
  toolbar,
  sequenceHostRef,
  children,
}: {
  preview: ReactNode;
  toolbar?: ReactNode;
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
      {toolbar && <div className="structure-workbench-toolbar">{toolbar}</div>}
      <div className="structure-workbench-view">{preview}</div>
      <div className="structure-workbench-details">{children}</div>
      {sequenceHostRef && (
        <div className="structure-workbench-sequence" ref={sequenceHostRef} />
      )}
    </div>
  );
}
