import {
  ColumnWidthOutlined,
  FullscreenExitOutlined,
  FullscreenOutlined,
  LayoutOutlined,
} from "@ant-design/icons";
import { useRef } from "react";
import type { Language } from "../types";
import { useWorkspaceFullscreen } from "./useWorkspaceFullscreen";
import "./workspace-fullscreen.css";

export function WorkspaceFullscreenControl({
  language,
  compact = false,
  structureFocus = false,
}: {
  language: Language;
  compact?: boolean;
  structureFocus?: boolean;
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
  const focusLabel = fullscreen.focused
    ? zh
      ? "显示分析面板"
      : "Show analysis panel"
    : zh
      ? "专注结构"
      : "Focus structure";
  return (
    <>
      {structureFocus && fullscreen.canFocus && (
        <button
          type="button"
          className={
            compact
              ? "workspace-structure-focus"
              : "workspace-structure-focus text-button"
          }
          aria-label={focusLabel}
          aria-pressed={fullscreen.focused}
          onClick={fullscreen.toggleFocus}
        >
          {fullscreen.focused ? <LayoutOutlined /> : <ColumnWidthOutlined />}
          <span>{focusLabel}</span>
        </button>
      )}
      <button
        ref={anchor}
        data-workspace-expand
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
