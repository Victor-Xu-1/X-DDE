import { useId } from "react";
import { MoleculeImage } from "../presentation/MoleculeImage";
import type { MoleculeRef } from "../research/types";
import type { Language } from "../types";
import { validFepSelection, type FepRecord } from "./fep-series";
import { FepRecordIdentity, fepRecordName } from "./FepRecordIdentity";

export function FepMoleculeReview({
  source,
  records,
  selected,
  language,
}: {
  source?: MoleculeRef;
  records?: FepRecord[];
  selected: number[];
  language: Language;
}) {
  const id = useId(),
    zh = language === "zh";
  const valid = source && validFepSelection(records, selected);
  return (
    <section className="simulation-molecule-review" aria-labelledby={id}>
      <h3 id={id}>{zh ? "递交的分子" : "Molecules to submit"}</h3>
      {valid && records ? (
        <ul className="simulation-review-molecules">
          {selected.map((record) => {
            const item = records[record];
            return (
              <li key={record} data-original-record={record}>
                <FepRecordIdentity record={item} language={language} />
                <MoleculeImage
                  compact
                  language={language}
                  label={`${fepRecordName(item, language)} · ${record + 1}`}
                  source={{
                    url: `/api/assets/${encodeURIComponent(source.asset_id)}`,
                    record,
                  }}
                />
              </li>
            );
          })}
        </ul>
      ) : (
        <p role="status">
          {zh
            ? "请返回分子选择页，核对完整的所选分子。"
            : "Return to molecular selection to check the complete selection."}
        </p>
      )}
    </section>
  );
}
