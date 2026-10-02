import { useState } from "react";
import type { Language } from "../types";
import type { IdentityResult } from "../diffsbdd/types";
import type { SavedRegion } from "./model";
import { StructureViewer } from "../viewer/StructureViewer";
import { artifactUrl } from "../api";

export function RegionResult({
  record,
  identity,
  language,
}: {
  record: SavedRegion;
  identity: IdentityResult | null;
  language: Language;
}) {
  const [active, setActive] = useState(0),
    zh = language === "zh";
  const region = record.body.regions[active];
  return (
    <section aria-label={zh ? "已保存区域" : "Saved regions"}>
      <p>{record.body.name}</p>
      <div
        className="segmented"
        role="group"
        aria-label={zh ? "查看区域" : "View region"}
      >
        {record.body.regions.map((value, index) => (
          <button
            type="button"
            key={value.name}
            aria-pressed={index === active}
            onClick={() => setActive(index)}
          >
            {value.name} · {value.atom_indices.length}
          </button>
        ))}
      </div>
      {identity ? (
        <StructureViewer
          urls={[
            artifactUrl(record.body.identity_job, identity.molecule_artifact),
          ]}
          language={language}
          highlightedAtoms={region.atom_indices}
        />
      ) : (
        <p role="status">
          {zh
            ? "读取原子身份与三维结构…"
            : "Loading native atom identities and structure…"}
        </p>
      )}
      <p className="field-help">
        {zh ? "原子编号（从 1 开始）" : "Atom numbers (starting at 1)"}:{" "}
        {region.atom_indices.map((index) => index + 1).join(", ")}
      </p>
    </section>
  );
}
