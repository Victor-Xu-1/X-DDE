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
  const fullscreen = useWorkspaceFullscreen(anchor),
    zh = language === "zh";
  const label = fullscreen.active
    ? zh
      ? "退出全屏"
      : "Exit fullscreen"
    : fullscreen.workspace
      ? zh
        ? "全屏研究工作区"
        : "Fullscreen research workspace"
      : zh
        ? "全屏显示结构"
        : "Fullscreen structure";
  return (
    <>
      <button
        ref={anchor}
        type="button"
        className={compact ? undefined : "text-button"}
        aria-label={label}
        title={label}
        aria-pressed={fullscreen.active}
        disabled={fullscreen.pending}
        onClick={() => void fullscreen.toggle()}
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
            ? "浏览器未允许全屏，仍可继续使用当前视图。"
            : "Fullscreen is unavailable in this browser; the current view remains usable."}
        </span>
      )}
    </>
  );
}
