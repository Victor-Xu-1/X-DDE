import type { ReactNode } from "react";
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
  if (!source) return <>{summary}</>;
  return (
    <section
      className="molecular-input-review"
      aria-label={language === "zh" ? "分子输入核对" : "Molecular input review"}
    >
      <div>{summary}</div>
      <figure>
        <MoleculeImage
          key={JSON.stringify(source)}
          source={source}
          language={language}
          label={caption}
          compact
        />
        <figcaption>{caption}</figcaption>
      </figure>
    </section>
  );
}
