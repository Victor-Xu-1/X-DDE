import { FullscreenExitOutlined } from "@ant-design/icons";
import { useRef } from "react";
import { useWorkspaceFullscreen } from "../presentation/useWorkspaceFullscreen";
import type { Language } from "../types";

/** The workspace can still close after a file change hides its original viewer. */
export function ResearchWorkspaceExpansionExit({
  language,
  onClose,
}: {
  language: Language;
  onClose(): void;
}) {
  const anchor = useRef<HTMLButtonElement>(null);
  const zh = language === "zh";
  const workspace = useWorkspaceFullscreen(
    anchor,
    zh ? "研究文件工作区" : "Research files workspace",
  );
  return (
    <button
      ref={anchor}
      className="secondary-button research-expanded-exit"
      type="button"
      data-workspace-expand
      onClick={() => {
        workspace.toggle();
        onClose();
      }}
    >
      <FullscreenExitOutlined aria-hidden="true" />
      {zh ? "退出文件展开视图" : "Exit expanded file view"}
    </button>
  );
}
