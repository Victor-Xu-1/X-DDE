import { useState } from "react";
import type { Job, Language } from "../types";
import { ImageRecognition } from "./ImageRecognition";
import { UtilityTask, utilityCapability } from "./UtilityTask";
import { TaskBackendControl } from "./TaskBackendControl";

const utilityTabs = [
  ["image", "图片识别与编辑", "Image recognition & editor"],
  ["admet", "ADMET 预测", "ADMET prediction"],
  ["brain", "透脑评估", "Brain penetration"],
  ["properties", "分子性质", "Molecular properties"],
  ["screen", "相似性与结构筛查", "Similarity & structural alerts"],
  ["states", "质子化与互变异构", "Protonation & tautomers"],
] as const;
type Utility = (typeof utilityTabs)[number][0];

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
  return (
    <div className="utility-workspace">
      <div className="utility-tabbar">
        <nav
          className="utility-tabs"
          aria-label={zh ? "小工具分类" : "Utility tools"}
        >
          {utilityTabs.map(([id, cn, en]) => (
            <button
              key={id}
              type="button"
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
        {visible && active !== "image" && (
          <TaskBackendControl
            language={language}
            scope={{ capability: utilityCapability(active) }}
          />
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
                <UtilityTask
                  tool={id}
                  language={language}
                  onCreated={onCreated}
                  jobs={jobs}
                  active={visible && active === id}
                />
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
