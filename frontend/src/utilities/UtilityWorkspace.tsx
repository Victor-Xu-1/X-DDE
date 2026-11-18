import { useLayoutEffect, useRef, useState } from "react";
import type { Job, Language } from "../types";
import { ImageRecognition } from "./ImageRecognition";
import { UtilityTask, utilityCapability } from "./UtilityTask";
import { TaskBackendControl } from "./TaskBackendControl";
import { PrimaryBackendScope } from "./backend-control-scope";

const utilityTabs = [
  ["image", "图片识别与编辑", "Image recognition & editor"],
  ["admet", "ADMET 预测", "ADMET prediction"],
  ["brain", "透脑评估", "Brain penetration"],
  ["properties", "分子性质", "Molecular properties"],
  ["screen", "相似性与结构筛查", "Similarity & structural alerts"],
  ["states", "质子化与互变异构", "Protonation & tautomers"],
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
}: {
  language: Language;
  onCreated(job: Job): void;
  jobs?: readonly Job[];
  active?: boolean;
}) {
  const [active, setActive] = useState<Utility>("image");
  const [imageActions, setImageActions] = useState<HTMLDivElement | null>(null);
  const [visited, setVisited] = useState<Utility[]>(["image"]);
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
    visible && active !== "image" ? { capability: utilityCapability(active) } : null;
  return (
    <div className="utility-workspace">
      <div className="utility-tabbar">
        <nav
          ref={navigation}
          className="utility-tabs"
          aria-label={zh ? "小工具分类" : "Utility tools"}
        >
          {utilityTabs.map(([id, cn, en]) => (
            <button
              key={id}
              type="button"
              ref={active === id ? activeTab : undefined}
              aria-pressed={active === id}
              onClick={() => {
                setActive(id);
                setVisited((previous) =>
                  previous.includes(id) ? previous : [...previous, id],
                );
              }}
            >
              {zh ? cn : en}
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
                  />
                </PrimaryBackendScope.Provider>
              </>
            ) : (
              <ImageRecognition
                language={language}
                actionsTarget={imageActions}
              />
            )}
          </section>
        );
      })}
    </div>
  );
}
