import { useState } from "react";
import type { Job, Language } from "../types";
import { AdmetForm } from "../admet/AdmetForm";
import { PropertyForm } from "../operations/PropertyForm";
import { LibraryScreenForm } from "../chemistry/LibraryScreenForm";
import { StateForm } from "../chemistry/StateForm";
import { ImageRecognition } from "./ImageRecognition";

const utilityTabs = [
  ["image", "图片识别与编辑", "Image recognition & editor"],
  ["admet", "ADMET 预测", "ADMET prediction"],
  ["properties", "分子性质", "Molecular properties"],
  ["screen", "相似性与结构筛查", "Similarity & structural alerts"],
  ["states", "质子化与互变异构", "Protonation & tautomers"],
] as const;
type Utility = (typeof utilityTabs)[number][0];

export function UtilityWorkspace({
  language,
  onCreated,
}: {
  language: Language;
  onCreated(job: Job): void;
}) {
  const [active, setActive] = useState<Utility>("image");
  const [visited, setVisited] = useState<Utility[]>(["image"]);
  const forms = {
    admet: AdmetForm,
    properties: PropertyForm,
    screen: LibraryScreenForm,
    states: StateForm,
  };
  const zh = language === "zh";
  return (
    <div className="utility-workspace">
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
      {utilityTabs.map(([id, cn, en]) => {
        if (!visited.includes(id)) return null;
        const Form = id === "image" ? null : forms[id];
        return (
          <section key={id} hidden={active !== id} aria-label={zh ? cn : en}>
            {Form ? (
              <>
                <h1 className="utility-form-title">{zh ? cn : en}</h1>
                <Form language={language} onCreated={onCreated} />
              </>
            ) : (
              <ImageRecognition language={language} />
            )}
          </section>
        );
      })}
    </div>
  );
}
