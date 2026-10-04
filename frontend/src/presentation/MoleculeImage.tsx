import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { LoadingOutlined } from "@ant-design/icons";
import { DepictionRenderer, type DepictionSource } from "./depiction-renderer";
import type { Language } from "../types";
import "./molecule-image.css";
const DrawingContext = createContext<DepictionRenderer | null>(null);
export function MoleculeDrawingProvider({ children }: { children: ReactNode }) {
  const frame = useRef<HTMLIFrameElement>(null);
  const [renderer, setRenderer] = useState<DepictionRenderer | null>(null),
    [active, setActive] = useState(false);
  useEffect(() => {
    const next = new DepictionRenderer(() => {
      setActive(true);
      return frame.current;
    });
    setRenderer(next);
    return () => next.close();
  }, []);
  return (
    <DrawingContext.Provider value={renderer}>
      {children}
      {active && (
        <iframe
          ref={frame}
          className="drawing-service-frame"
          title="Local 2D molecule drawing service"
          aria-hidden="true"
          tabIndex={-1}
          src="/tools/ketcher/index.html"
        />
      )}
    </DrawingContext.Provider>
  );
}
export function MoleculeImage({
  source,
  language,
  label,
  compact = false,
}: {
  source: DepictionSource | null;
  language: Language;
  label: string;
  compact?: boolean;
}) {
  const renderer = useContext(DrawingContext),
    key = JSON.stringify(source),
    zh = language === "zh";
  const [url, setUrl] = useState(""),
    [error, setError] = useState(false),
    [visible, setVisible] = useState(false),
    [attempt, setAttempt] = useState(0);
  const element = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (typeof IntersectionObserver === "undefined") {
      setVisible(true);
      return;
    }
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          setVisible(true);
          observer.disconnect();
        }
      },
      { rootMargin: "120px" },
    );
    if (element.current) observer.observe(element.current);
    return () => observer.disconnect();
  }, []);
  useEffect(() => {
    const controller = new AbortController();
    let owned = "";
    setUrl("");
    setError(false);
    if (!visible) return () => controller.abort();
    if (!source || !renderer) {
      setError(true);
      return () => controller.abort();
    }
    void renderer
      .render(source, controller.signal)
      .then((value) => {
        if (!controller.signal.aborted) {
          owned = URL.createObjectURL(value);
          setUrl(owned);
        }
      })
      .catch((reason) => {
        if (!controller.signal.aborted) {
          console.warn(
            "Molecular drawing unavailable",
            reason instanceof Error ? reason.message : String(reason),
          );
          setError(true);
        }
      });
    return () => {
      controller.abort();
      if (owned) URL.revokeObjectURL(owned);
    };
  }, [key, renderer, visible, attempt]);
  return (
    <div
      ref={element}
      className={"molecule-image" + (compact ? " is-thumbnail" : "")}
    >
      {url ? (
        <img
          src={url}
          alt={(zh ? "二维分子结构 · " : "2D molecular structure · ") + label}
        />
      ) : error ? (
        <span
          title={
            zh
              ? "二维结构暂不可绘制；请检查原始记录或 Ketcher 组件。三维与原始文件仍保留。"
              : "2D drawing unavailable. Check the original record or Ketcher component; 3D views and originals remain available."
          }
        >
          {zh ? "二维图暂不可用" : "2D unavailable"}
        </span>
      ) : (
        <LoadingOutlined
          aria-label={zh ? "绘制二维结构" : "Drawing 2D structure"}
        />
      )}
      {!compact && url && (
        <a href={url} download="molecule.svg">
          {zh ? "下载结构图片" : "Download structure image"}
        </a>
      )}
      {!compact && error && source && (
        <button
          type="button"
          className="secondary-button"
          onClick={() => {
            renderer?.retryInitialization();
            setAttempt((value) => value + 1);
          }}
        >
          {zh ? "重新绘图" : "Retry drawing"}
        </button>
      )}
    </div>
  );
}
