import { useEffect, useRef, useState } from "react";
import {
  MSAViewer,
  renderToSvg,
  resolveTheme,
  type MsaViewModel,
  type Cell,
  type Viewport,
} from "react-msaview";
import type { Language } from "../../types";
import { downloadBlob } from "../visual-export";
import type { AlignmentProjection } from "./alignment-data";

export default function AlignmentCanvas({
  data,
  language,
}: {
  data: AlignmentProjection;
  language: Language;
}) {
  const zh = language === "zh";
  const model = useRef<MsaViewModel | null>(null);
  const live = useRef(true);
  const [zoom, setZoom] = useState(12),
    [scheme, setScheme] = useState("clustal");
  const [position, setPosition] = useState("1"),
    [highlight, setHighlight] = useState<number>();
  const [viewport, setViewport] = useState<Viewport>();
  const [cell, setCell] = useState<Cell>(),
    [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState(false);
  useEffect(() => {
    live.current = true;
    return () => {
      live.current = false;
      model.current = null;
    };
  }, []);
  async function exportView() {
    if (!model.current?.viewInitialized || exporting) return;
    setExporting(true);
    setExportError(false);
    try {
      const svg = await renderToSvg(model.current, {
        theme: resolveTheme("light"),
        exportType: "viewport",
        includeTracks: true,
        includeMinimap: true,
      });
      if (live.current)
        downloadBlob(
          new Blob([svg], { type: "image/svg+xml;charset=utf-8" }),
          "alignment-visible-region.svg",
        );
    } catch {
      if (live.current) setExportError(true);
    } finally {
      if (live.current) setExporting(false);
    }
  }
  return (
    <div className="alignment-canvas">
      <div className="alignment-controls">
        <label>
          {zh ? "配色" : "Color"}
          <select
            value={scheme}
            onChange={(event) => setScheme(event.target.value)}
          >
            <option value="clustal">Clustal</option>
            <option value="jalview_zappo">Zappo</option>
            <option value="jalview_taylor">Taylor</option>
          </select>
        </label>
        <label>
          {zh ? "列宽" : "Column width"}
          <select
            value={zoom}
            onChange={(event) => {
              const width = Number(event.target.value),
                current = model.current;
              if (current?.viewInitialized) {
                const center =
                  (-current.scrollX + current.msaCanvasWidth / 2) /
                  current.colWidth;
                current.setColWidth(width);
                current.setScrollX(
                  -center * width + current.msaCanvasWidth / 2,
                );
              }
              setZoom(width);
            }}
          >
            {[6, 12, 18, 24].map((value) => (
              <option key={value} value={value}>
                {value} px
              </option>
            ))}
          </select>
        </label>
        <form
          onSubmit={(event) => {
            event.preventDefault();
            const start = Number(position);
            if (
              Number.isInteger(start) &&
              start >= 1 &&
              start <= data.columns &&
              model.current?.viewInitialized
            ) {
              model.current.setScrollX(
                -(start - 1) * model.current.colWidth +
                  model.current.msaCanvasWidth / 2,
              );
              setHighlight(start);
            }
          }}
        >
          <label>
            {zh ? "查询位点" : "Query position"}
            <input
              type="number"
              min="1"
              max={data.columns}
              required
              value={position}
              onChange={(event) => setPosition(event.target.value)}
            />
          </label>
          <button type="submit">{zh ? "定位" : "Go"}</button>
        </form>
        <button
          type="button"
          disabled={exporting}
          onClick={() => void exportView()}
        >
          {zh ? "导出当前视图 · SVG" : "Export current view · SVG"}
        </button>
      </div>
      {exportError && (
        <p role="alert">
          {zh
            ? "视图导出失败，请重新尝试。"
            : "View export failed; please try again."}
        </p>
      )}
      <MSAViewer
        msa={data.fasta}
        height={560}
        colWidth={zoom}
        rowHeight={22}
        colorScheme={scheme}
        drawTree={false}
        treeAreaWidth={220}
        hideHeader
        highlightColumns={highlight === undefined ? [] : [highlight]}
        onViewportChange={setViewport}
        theme="light"
        onModel={(value) => {
          model.current = value;
        }}
        onCellClick={setCell}
      />
      {viewport && (
        <p className="field-help">
          {zh ? "当前查询列" : "Visible query columns"}: {viewport.startColumn}–
          {viewport.endColumn} / {data.columns}
        </p>
      )}
      <p className="field-help" aria-live="polite">
        {cell
          ? `${data.labels[cell.row ?? ""] ?? cell.row ?? ""} · ${zh ? "查询列" : "Query column"} ${cell.column} · ${cell.letter ?? "—"}`
          : zh
            ? "滚动浏览全部比对，点击残基查看来源及查询位置。"
            : "Scroll through the complete alignment; click a residue to inspect its source and query position."}
      </p>
    </div>
  );
}
