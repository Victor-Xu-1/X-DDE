import { useLayoutEffect, useRef, useState } from "react";
import type { Job, Language } from "../types";
import { ImageRecognition } from "./ImageRecognition";
import { UtilityTask, utilityCapability } from "./UtilityTask";
import { TaskBackendControl } from "./TaskBackendControl";
import { PrimaryBackendScope } from "./backend-control-scope";
import type {
  DrawingDestination,
  EditorDrawing,
} from "./useRecognitionDrawing";

const utilityTabs = [
  [
    "image",
    "图片识别与编辑",
    "Image recognition & editor",
    "图片识别",
    "Image recognition",
  ],
  ["admet", "ADMET 预测", "ADMET prediction", "ADMET", "ADMET"],
  ["brain", "透脑评估", "Brain penetration", "透脑评估", "BBB"],
  ["properties", "分子性质", "Molecular properties", "分子性质", "Properties"],
  [
    "screen",
    "相似性与结构筛查",
    "Similarity & structural alerts",
    "结构筛查",
    "Similarity",
  ],
  ["states", "质子化与互变异构", "Protonation & tautomers", "质子化与互变", "Protonation"],
] as const;
type Utility = (typeof utilityTabs)[number][0];

function revealTab(strip: HTMLElement, tab: HTMLButtonElement) {
  if (!strip.clientWidth) return;
  const { left, right } = strip.getBoundingClientRect();
  const bounds = tab.getBoundingClientRect();
  if (bounds.left < left || bounds.width > strip.clientWidth) {
    strip.scrollLeft += bounds.left - left;
  } else if (bounds.right > right) {
    strip.scrollLeft += bounds.right - right;
  }
}

export function UtilityWorkspace({
  language,
  onCreated,
  jobs = [],
  active: visible = true,
  imageRequest = 0,
}: {
  language: Language;
  onCreated(job: Job): void;
  jobs?: readonly Job[];
  active?: boolean;
  imageRequest?: number;
}) {
  const [selection, setSelection] = useState<{ tab: Utility; request: number }>(
    {
      tab: "image",
      request: imageRequest,
    },
  );
  // Explicit screenshot entries select the image tab without remounting drafts.
  const active = selection.request === imageRequest ? selection.tab : "image";
  const [imageActions, setImageActions] = useState<HTMLDivElement | null>(null);
  const [visited, setVisited] = useState<Utility[]>(["image"]);
  const [drawings, setDrawings] = useState<
    Partial<Record<DrawingDestination, EditorDrawing>>
  >({});
  const zh = language === "zh";
  const navigation = useRef<HTMLElement>(null);
  const activeTab = useRef<HTMLButtonElement>(null);
  useLayoutEffect(() => {
    const strip = navigation.current;
    const selected = activeTab.current;
    if (!visible || !strip || !selected) return;
    revealTab(strip, selected);
    if (typeof ResizeObserver === "undefined") return;
    // Layout and text can resize independently of the window. Leave manual scrolling alone.
    const observer = new ResizeObserver(() => {
      const focused = document.activeElement;
      const browsingTabs =
        focused instanceof HTMLButtonElement && strip.contains(focused);
      revealTab(strip, browsingTabs ? focused : selected);
    });
    observer.observe(strip);
    for (const tab of strip.children) observer.observe(tab);
    return () => observer.disconnect();
  }, [active, language, visible]);
  const backendScope =
    visible && active !== "image"
      ? { capability: utilityCapability(active) }
      : null;
  function selectUtility(tab: Utility) {
    setSelection({ tab, request: imageRequest });
    setVisited((previous) =>
      previous.includes(tab) ? previous : [...previous, tab],
    );
  }
  function receiveDrawing(
    destination: DrawingDestination,
    drawing: EditorDrawing,
  ) {
    setDrawings((previous) => ({ ...previous, [destination]: drawing }));
    selectUtility(destination);
  }
  return (
    <div className="utility-workspace">
      <div className="utility-tabbar">
        <nav
          ref={navigation}
          className="utility-tabs"
          aria-label={zh ? "小工具分类" : "Utility tools"}
        >
          {utilityTabs.map(([id, cn, en, shortCn, shortEn]) => (
            <button
              key={id}
              type="button"
              aria-label={zh ? cn : en}
              title={zh ? cn : en}
              ref={active === id ? activeTab : undefined}
              aria-pressed={active === id}
              onClick={() => selectUtility(id)}
            >
              <span className="utility-tab-full">{zh ? cn : en}</span>
              <span className="utility-tab-compact" aria-hidden="true">
                {zh ? shortCn : shortEn}
              </span>
            </button>
          ))}
        </nav>
        <div
          className="utility-tab-actions"
          ref={setImageActions}
          hidden={active !== "image"}
        />
        {backendScope && (
          <TaskBackendControl language={language} scope={backendScope} />
        )}
      </div>
      {utilityTabs.map(([id, cn, en]) => {
        if (!visited.includes(id)) return null;
        return (
          <section
            className="utility-panel"
            data-utility={id}
            key={id}
            hidden={active !== id}
            aria-label={zh ? cn : en}
          >
            {id !== "image" ? (
              <>
                <h1 className="sr-only">{zh ? cn : en}</h1>
                <PrimaryBackendScope.Provider value={backendScope}>
                  <UtilityTask
                    tool={id}
                    language={language}
                    onCreated={onCreated}
                    jobs={jobs}
                    active={visible && active === id}
                    drawing={drawings[id]}
                    onDrawingHandled={(token) => {
                      setDrawings((previous) =>
                        previous[id]?.id === token
                          ? { ...previous, [id]: undefined }
                          : previous,
                      );
                    }}
                  />
                </PrimaryBackendScope.Provider>
              </>
            ) : (
              <ImageRecognition
                language={language}
                actionsTarget={imageActions}
                visible={visible && active === id}
                focusRequest={imageRequest}
                onHandoff={receiveDrawing}
              />
            )}
          </section>
        );
      })}
    </div>
  );
}
