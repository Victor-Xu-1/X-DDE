import { useLayoutEffect, useRef, useState, type ReactNode } from "react";
import type { Language } from "../types";

/** Viewing magnification never changes the native figure or its print dimensions. */
export function FigureViewport({
  children,
  language,
  transparent,
  widthMm,
  ready,
}: {
  children: ReactNode;
  language: Language;
  transparent: boolean;
  widthMm: number;
  ready: boolean;
}) {
  const zh = language === "zh";
  const [zoom, setZoom] = useState(1),
    [dragging, setDragging] = useState(false);
  const viewport = useRef<HTMLDivElement>(null),
    previous = useRef(1);
  const drag = useRef<{
    id: number;
    x: number;
    y: number;
    left: number;
    top: number;
  } | null>(null);
  useLayoutEffect(() => {
    const view = viewport.current;
    if (!view) return;
    const ratio = zoom / previous.current;
    view.scrollLeft =
      zoom === 1
        ? 0
        : (view.scrollLeft + view.clientWidth / 2) * ratio -
          view.clientWidth / 2;
    view.scrollTop =
      zoom === 1
        ? 0
        : (view.scrollTop + view.clientHeight / 2) * ratio -
          view.clientHeight / 2;
    previous.current = zoom;
  }, [zoom]);
  return (
    <>
      <div
        ref={viewport}
        className={`figure-preview-sheet ${transparent ? "is-transparent" : ""}`}
        data-zoom={zoom}
        data-dragging={dragging}
        role="region"
        aria-label={zh ? "图件画布" : "Figure canvas"}
        tabIndex={ready && zoom > 1 ? 0 : -1}
        title={
          zh
            ? "放大后可拖动或用方向键平移。"
            : "After zooming, drag or use arrow keys to pan."
        }
        onPointerDown={(event) => {
          if (
            !ready ||
            zoom === 1 ||
            event.button !== 0 ||
            event.pointerType === "touch"
          )
            return;
          const view = event.currentTarget;
          drag.current = {
            id: event.pointerId,
            x: event.clientX,
            y: event.clientY,
            left: view.scrollLeft,
            top: view.scrollTop,
          };
          view.setPointerCapture(event.pointerId);
          view.focus({ preventScroll: true });
          event.preventDefault();
          setDragging(true);
        }}
        onPointerMove={(event) => {
          const start = drag.current;
          if (!start || start.id !== event.pointerId) return;
          event.currentTarget.scrollLeft =
            start.left - (event.clientX - start.x);
          event.currentTarget.scrollTop = start.top - (event.clientY - start.y);
        }}
        onPointerUp={(event) => {
          if (event.currentTarget.hasPointerCapture(event.pointerId))
            event.currentTarget.releasePointerCapture(event.pointerId);
          drag.current = null;
          setDragging(false);
        }}
        onPointerCancel={() => {
          drag.current = null;
          setDragging(false);
        }}
        onLostPointerCapture={() => {
          drag.current = null;
          setDragging(false);
        }}
      >
        <div
          className="figure-preview-image-space"
          style={{ width: `${zoom * 100}%`, height: `${zoom * 100}%` }}
        >
          {children}
        </div>
      </div>
      <div className="figure-view-toolbar">
        <span className="figure-preview-width">{widthMm} mm</span>
        <div role="group" aria-label={zh ? "预览查看" : "Preview viewing"}>
          <button
            type="button"
            disabled={!ready || zoom === 1}
            aria-label={zh ? "缩小预览" : "Zoom out preview"}
            onClick={() => setZoom((value) => Math.max(1, value - 1))}
          >
            −
          </button>
          <span
            aria-label={zh ? "预览倍率" : "Preview zoom"}
            aria-live="polite"
          >
            {zoom}×
          </span>
          <button
            type="button"
            disabled={!ready || zoom === 4}
            aria-label={zh ? "放大预览" : "Zoom in preview"}
            onClick={() => setZoom((value) => Math.min(4, value + 1))}
          >
            +
          </button>
          <button
            type="button"
            disabled={!ready || zoom === 1}
            onClick={() => setZoom(1)}
          >
            {zh ? "适应窗口" : "Fit preview"}
          </button>
        </div>
      </div>
    </>
  );
}
