import { useContext, type ReactNode } from "react";
import { TaskPresentationContext } from "./TaskPresentation";
import type { Language } from "../types";
import { MoleculeImage } from "../presentation/MoleculeImage";
import type { DepictionSource } from "../presentation/depiction-renderer";
import "./molecular-review.css";

/** Review the actual submitted record without changing its scientific source. */
export function MolecularReview({
  language,
  summary,
  source,
  caption,
}: {
  language: Language;
  summary: ReactNode;
  source: DepictionSource | null;
  caption: string;
}) {
  const compact = useContext(TaskPresentationContext)?.layout === "single";
  if (!source)
    return compact ? (
      <p className="field-help">
        {language === "zh"
          ? "添加分子后可核对结构。"
          : "Add a molecule to inspect its structure."}
      </p>
    ) : (
      <>{summary}</>
    );
  return (
    <section
      className="molecular-input-review"
      aria-label={language === "zh" ? "分子输入核对" : "Molecular input review"}
    >
      <figure>
        <MoleculeImage
          key={JSON.stringify(source)}
          source={source}
          language={language}
          label={caption}
        />
        <figcaption>{caption}</figcaption>
      </figure>
      {compact ? (
        <details className="molecular-input-summary">
          <summary>{language === "zh" ? "输入摘要" : "Input summary"}</summary>
          {summary}
        </details>
      ) : (
        <div className="molecular-input-summary">{summary}</div>
      )}
    </section>
  );
}
