import { FullscreenExitOutlined, FullscreenOutlined } from "@ant-design/icons";
import { useRef } from "react";
import type { Language } from "../types";
import { useWorkspaceFullscreen } from "./useWorkspaceFullscreen";
import "./workspace-fullscreen.css";

export function WorkspaceFullscreenControl({
  language,
  compact = false,
}: {
  language: Language;
  compact?: boolean;
}) {
  const anchor = useRef<HTMLButtonElement>(null);
  const zh = language === "zh";
  const fullscreen = useWorkspaceFullscreen(
    anchor,
    zh ? "结构研究工作区" : "Structure research workspace",
  );
  const label = fullscreen.active
    ? zh
      ? "关闭展开视图"
      : "Close expanded view"
    : fullscreen.workspace
      ? zh
        ? "展开研究工作区"
        : "Expand research workspace"
      : zh
        ? "展开结构视图"
        : "Expand structure view";
  return (
    <>
      <button
        ref={anchor}
        type="button"
        className={compact ? undefined : "text-button"}
        aria-label={label}
        title={label}
        aria-pressed={fullscreen.active}
        aria-haspopup="dialog"
        onClick={fullscreen.toggle}
      >
        {compact ? (
          fullscreen.active ? (
            <FullscreenExitOutlined />
          ) : (
            <FullscreenOutlined />
          )
        ) : (
          label
        )}
      </button>
      {fullscreen.error && (
        <span className="workspace-fullscreen-error" role="alert">
          {zh
            ? "暂时无法展开，仍可继续使用当前视图。"
            : "Expanded view is unavailable; the current view remains usable."}
        </span>
      )}
    </>
  );
}
