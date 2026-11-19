import { useState, type ReactNode } from "react";
import { CameraOutlined, DownloadOutlined } from "@ant-design/icons";
import { FigureExport } from "../publication/FigureExport";
import type { FigureSettings } from "../publication/settings";
import { WorkspaceFullscreenControl } from "../presentation/WorkspaceFullscreenControl";
import type { Language } from "../types";
import { validSource } from "./protocol";
import { ViewerToolGroup } from "./ViewerToolGroup";

export function ViewerExportActions({
  language,
  originalUrls,
  filename = "X-DDE-structure",
  sourceKey,
  sourceReady,
  busy,
  aspect,
  render,
  capture,
  leading,
  showWorkspaceControls = true,
}: {
  language: Language;
  originalUrls: readonly string[];
  filename?: string;
  sourceKey: string;
  sourceReady: boolean;
  busy: boolean;
  aspect(): number;
  render(settings: FigureSettings): Promise<Blob>;
  capture(scale: number): void;
  leading?: ReactNode;
  showWorkspaceControls?: boolean;
}) {
  const zh = language === "zh";
  const [scale, setScale] = useState(2);
  const downloadLabel = zh ? "下载结构文件" : "Download structure files";
  const captureLabel = zh ? "生成三维视图图片" : "Capture 3D view";
  const downloads = originalUrls.filter((url) => {
    try {
      validSource(url, location.origin);
      return true;
    } catch {
      return false;
    }
  });
  return (
    <div className="viewer-heading-actions">
      {leading}
      <ViewerToolGroup
        kind="actions"
        label={zh ? "结构下载与清晰度" : "Structure files and resolution"}
      >
        {downloads.length > 0 && (
          <details className="viewer-original-downloads">
            <summary aria-label={downloadLabel} title={downloadLabel}>
              <DownloadOutlined />
            </summary>
            <div>
              {downloads.map((url, index) => (
                <a key={url} href={url} download>
                  {zh ? "结构 " : "Structure "}
                  {index + 1}
                </a>
              ))}
            </div>
          </details>
        )}
        <select
          className="viewer-export-size"
          value={scale}
          aria-label={zh ? "三维图片清晰度" : "3D image resolution"}
          onChange={(event) => setScale(Number(event.target.value))}
        >
          <option value="1">{zh ? "屏幕 1×" : "Screen 1×"}</option>
          <option value="2">{zh ? "清晰 2×" : "Clear 2×"}</option>
          <option value="3">{zh ? "精细 3×" : "Fine 3×"}</option>
        </select>
      </ViewerToolGroup>
      <FigureExport
        sourceKey={sourceKey}
        sourceReady={sourceReady}
        language={language}
        filename={filename}
        format="png"
        typography
        molecular
        structureFraming
        compactTrigger
        aspect={aspect}
        disabled={busy}
        render={render}
      />
      <button
        type="button"
        disabled={!sourceReady || busy}
        aria-label={captureLabel}
        title={captureLabel}
        onClick={() => capture(scale)}
      >
        <CameraOutlined />
      </button>
      {showWorkspaceControls && (
        <WorkspaceFullscreenControl
          language={language}
          compact
          structureFocus
        />
      )}
    </div>
  );
}
