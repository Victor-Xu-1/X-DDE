import { useEffect, useRef, useState } from "react";
import {
  AimOutlined,
  FullscreenOutlined,
  MinusOutlined,
  PlusOutlined,
  ReloadOutlined,
  LoadingOutlined,
} from "@ant-design/icons";
import type { Language } from "../types";
import { Hint } from "../guided/Hint";

interface Props {
  urls: string[];
  language: Language;
  reference?: string | null;
  focusResidue?: { residue: string; nonce: number } | null;
  comparison?: boolean;
}
export function StructureViewer({
  urls,
  language,
  reference,
  focusResidue,
  comparison = false,
}: Props) {
  const frame = useRef<HTMLIFrameElement>(null);
  const [ready, setReady] = useState(false),
    [status, setStatus] = useState("empty"),
    [error, setError] = useState("");
  const [mode, setMode] = useState("surface"),
    [chains, setChains] = useState<string[]>([]);
  const zh = language === "zh";
  const [selection, setSelection] = useState<{
    chain: string;
    residue: string;
    atom: string;
    element: string;
  } | null>(null);
  const key = urls.join("|");
  function send(type: string, value?: unknown) {
    frame.current?.contentWindow?.postMessage(
      { channel: "opendde-viewer", type, value },
      location.origin,
    );
  }
  useEffect(() => {
    function message(event: MessageEvent) {
      if (
        event.origin !== location.origin ||
        event.source !== frame.current?.contentWindow ||
        event.data?.channel !== "opendde-viewer"
      )
        return;
      if (event.data.type === "ready") setReady(true);
      else if (event.data.type === "selected") setSelection(event.data.detail);
      else if (event.data.type === "error") {
        setStatus("error");
        setError(String(event.data.detail));
      } else if (event.data.type === "loaded") {
        setStatus("loaded");
        setChains(event.data.detail.chains || []);
      } else if (event.data.type === "loading") setStatus("loading");
    }
    window.addEventListener("message", message);
    return () => window.removeEventListener("message", message);
  }, []);
  useEffect(() => {
    if (ready && urls.length) {
      send("load", urls);
      setError("");
      setStatus("loading");
      setSelection(null);
    } else if (!urls.length) {
      if (ready) send("clear");
      setStatus("empty");
      setChains([]);
      setError("");
      setSelection(null);
    }
  }, [ready, key]);
  useEffect(() => {
    if (ready && focusResidue) send("residue", focusResidue.residue);
  }, [ready, focusResidue]);
  function changeMode(next: string) {
    setMode(next);
    send("mode", next);
  }
  return (
    <section className="studio-panel viewer-panel">
      <div className="studio-heading">
        <h3>
          {zh ? "三维结构预览" : "3D structure preview"}{" "}
          <Hint label={zh ? "三维预览说明" : "3D preview help"}>
            {zh
              ? "拖动旋转、滚轮缩放。点击原子或残基可查看名称；也可以点击下方的附近残基列表定位。"
              : "Drag to rotate, scroll to zoom, and select an atom or residue for its name. Nearby-residue links also locate residues."}
          </Hint>
        </h3>
        <button
          className="bare"
          title={zh ? "全屏" : "Fullscreen"}
          onClick={() =>
            void frame.current?.parentElement
              ?.requestFullscreen()
              .catch(() =>
                setError(zh ? "浏览器未允许全屏" : "Fullscreen unavailable"),
              )
          }
        >
          <FullscreenOutlined />
        </button>
      </div>
      <div className="segmented viewer-modes">
        {(
          [
            ["surface", "看整体", "Overall"],
            ["cartoon", "看蛋白骨架", "Backbone"],
            ["pocket", "看配体周围", "Ligand surroundings"],
          ] as const
        ).map(([id, cn, en]) => (
          <button
            key={id}
            className={mode === id ? "selected" : ""}
            disabled={comparison || status !== "loaded"}
            onClick={() => changeMode(id)}
          >
            {zh ? cn : en}
          </button>
        ))}
      </div>
      {comparison && (
        <p className="viewer-comparison">
          {zh
            ? "叠加比较：蓝 / 橙 / 紫分别表示不同构象。"
            : "Overlay: blue / orange / purple distinguish conformers."}
        </p>
      )}
      <div className="molecular-stage">
        <iframe
          ref={frame}
          src="/viewer.html"
          title={zh ? "可交互分子结构" : "Interactive molecular structure"}
        />
        {status === "loading" && (
          <div className="viewer-message" role="status">
            <LoadingOutlined spin />{" "}
            {zh ? "正在读取真实结构…" : "Loading structure…"}
          </div>
        )}
        {status === "empty" && (
          <div className="viewer-message">
            <AimOutlined />
            <strong>
              {zh
                ? "从预测结果或参考项目载入结构"
                : "Load a prediction or reference structure"}
            </strong>
            <span>
              {zh
                ? "可旋转、缩放并查看配体邻域"
                : "Rotate, zoom and inspect ligand neighborhoods"}
            </span>
          </div>
        )}
        {error && (
          <div className="viewer-error" role="alert">
            {error}
          </div>
        )}
        {reference && (
          <div className="reference-label">
            {zh
              ? "公开实验参考 · 非本次预测"
              : "Experimental reference · not a prediction"}{" "}
            {reference}
          </div>
        )}
        <div className="viewer-tools">
          <button
            title={zh ? "放大" : "Zoom in"}
            onClick={() => send("zoom", 1)}
          >
            <PlusOutlined />
          </button>
          <button
            title={zh ? "缩小" : "Zoom out"}
            onClick={() => send("zoom", -1)}
          >
            <MinusOutlined />
          </button>
          <button
            title={zh ? "重置视图" : "Reset view"}
            onClick={() => send("reset")}
          >
            <ReloadOutlined />
          </button>
        </div>
      </div>
      <div className="viewer-footer">
        <button onClick={() => send("reset")}>
          {zh ? "回到全局" : "Full structure"}
        </button>
        {chains.slice(0, 5).map((chain) => (
          <button key={chain} onClick={() => send("chain", chain)}>
            {zh ? "定位链 " : "Locate chain "}
            {chain}
          </button>
        ))}
        <span>
          {zh ? "拖动旋转 · 滚轮缩放" : "Drag to rotate · Scroll to zoom"}
        </span>
      </div>
      <p className="selection-explanation" role="status">
        {selection
          ? (zh ? "已选中：链 " : "Selected: chain ") +
            selection.chain +
            " · " +
            selection.residue +
            " · " +
            selection.atom +
            " (" +
            selection.element +
            ")"
          : zh
            ? "点击三维图中的原子或残基，即可查看名称。"
            : "Select an atom or residue in the preview to see its name."}
      </p>
    </section>
  );
}
