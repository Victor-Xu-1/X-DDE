import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { LoadingOutlined } from "@ant-design/icons";
import {
  DepictionRenderer,
  depictionDataUrl,
  type DepictionSource,
} from "./depiction-renderer";
import type { Language } from "../types";
import "./molecule-image.css";
import { FigureExport } from "../publication/FigureExport";
import { hiddenFrameFocus } from "./hidden-frame-focus";
import { molecularVector } from "../publication/molecular-vector";
const DrawingContext = createContext<DepictionRenderer | null | undefined>(
  undefined,
);
export function MoleculeDrawingProvider({ children }: { children: ReactNode }) {
  const frame = useRef<HTMLIFrameElement>(null);
  const protect = useRef<() => void>(() => undefined);
  const [renderer, setRenderer] = useState<DepictionRenderer | null>(null),
    [active, setActive] = useState(false);
  useEffect(() => {
    const focus = hiddenFrameFocus(() => frame.current);
    protect.current = () => focus.protect();
    const next = new DepictionRenderer(() => {
      setActive(true);
      focus.protect();
      return frame.current;
    });
    setRenderer(next);
    return () => {
      next.close();
      focus.close();
      protect.current = () => undefined;
    };
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
          inert
          onLoad={() => protect.current()}
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
  const [bondThickness, setBondThickness] = useState(1.6);
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
    setUrl("");
    setError(false);
    if (!visible) return () => controller.abort();
    if (!source || renderer === undefined) {
      setError(true);
      return () => controller.abort();
    }
    // The provider's first effect is still starting. This is loading, not a
    // failed drawing that can be accepted as an unavailable result screenshot.
    if (renderer === null) return () => controller.abort();
    void renderer
      .render(source, controller.signal, bondThickness)
      .then(depictionDataUrl)
      .then((value) => {
        if (!controller.signal.aborted) {
          setUrl(value);
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
    };
  }, [key, renderer, visible, attempt, bondThickness]);
  return (
    <div
      ref={element}
      className={"molecule-image" + (compact ? " is-thumbnail" : "")}
      data-drawing-state={
        !source
          ? "no-source"
          : url
            ? "ready"
            : error
              ? "unavailable"
              : "loading"
      }
    >
      {!compact && (
        <label className="molecule-drawing-style">
          {zh ? "图形线条" : "Drawing lines"}
          <select
            aria-label={zh ? "二维图线条粗细" : "2D drawing line weight"}
            value={bondThickness}
            onChange={(e) => setBondThickness(Number(e.target.value))}
          >
            <option value="1.2">{zh ? "精细" : "Fine"}</option>
            <option value="1.6">
              {zh ? "标准 · 推荐" : "Standard · Recommended"}
            </option>
            <option value="2.2">{zh ? "醒目" : "Bold"}</option>
          </select>
        </label>
      )}
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
        <FigureExport
          language={language}
          filename={label + "-structure"}
          format="svg"
          render={async (settings) => {
            if (!renderer || !source)
              throw new Error("Select a molecular structure first.");
            const blob = await renderer.render(
              source,
              new AbortController().signal,
              bondThickness,
              {
                widthMm: settings.widthMm,
                fontPt: settings.fontPt,
                transparent: settings.transparent,
              },
            );
            return molecularVector(blob, settings);
          }}
        />
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
