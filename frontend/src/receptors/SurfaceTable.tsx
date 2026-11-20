import { useId, useState } from "react";
import {
  ResearchTable,
  type ResearchColumn,
} from "../presentation/ResearchTable";
import type { Language } from "../types";
import {
  surfaceKey,
  surfaceLabel,
  type SurfaceResult,
  type SurfaceRow,
} from "./surface-types";
export function SurfaceTable({
  result,
  language,
  onLocate,
  selected,
}: {
  result: SurfaceResult;
  language: Language;
  onLocate(row: SurfaceRow): void;
  selected: string | null;
}) {
  const zh = language === "zh",
    id = useId(),
    [view, setView] = useState<"regions" | "atoms">(
      result.residues.length === 1 ? "atoms" : "regions",
    );
  const fields = [
    ["assembly", zh ? "暴露" : "Exposed", "assembly_area"],
    ["buried", zh ? "遮挡" : "Occluded", "buried_area"],
    ["isolated", zh ? "独立" : "Isolated", "isolated_area"],
  ] as const;
  const areas: ResearchColumn<SurfaceRow>[] = fields.map(
    ([key, name, field]) => ({
      key,
      label: (
        <span className="surface-area-column">
          {name}
          <small>Å²</small>
        </span>
      ),
      exportLabel: name + (zh ? "（Å²）" : " (Å²)"),
      value: (row) => row[field],
      numeric: true,
      render: (row) => row[field].toFixed(2),
    }),
  );
  return (
    <>
      <div
        className="surface-detail-tabs"
        role="tablist"
        aria-label={zh ? "面积明细" : "Area details"}
      >
        <button
          type="button"
          role="tab"
          id={id + "-regions"}
          aria-controls={id + "-panel"}
          aria-selected={view === "regions"}
          onClick={() => setView("regions")}
        >
          {zh ? "按区域" : "By region"}
        </button>
        <button
          type="button"
          role="tab"
          id={id + "-atoms"}
          aria-controls={id + "-panel"}
          aria-selected={view === "atoms"}
          onClick={() => setView("atoms")}
        >
          {zh ? "按原子" : "By atom"}
        </button>
      </div>
      <div role="tabpanel" id={id + "-panel"} aria-labelledby={id + "-" + view}>
        {view === "regions" ? (
          <ResearchTable
            compactToolbar
            rows={result.residues}
            columns={[
              {
                key: "residue",
                label: zh ? "配体 / 残基" : "Ligand / residue",
                value: surfaceLabel,
              },
              ...areas,
            ]}
            rowId={surfaceKey}
            language={language}
            title={zh ? "区域面积" : "Region areas"}
            onSelect={onLocate}
            selected={selected}
            compare={false}
            exportName="region-exposure.csv"
          />
        ) : (
          <ResearchTable<SurfaceResult["atoms"][number]>
            compactToolbar
            rows={result.atoms}
            columns={[
              {
                key: "atom",
                label: zh ? "原子" : "Atom",
                value: (r) => r.atom,
              },
              ...(result.residues.length > 1
                ? [
                    {
                      key: "region",
                      label: zh ? "区域" : "Region",
                      value: surfaceLabel,
                    },
                  ]
                : []),
              ...areas,
            ]}
            rowId={(r) => surfaceKey(r) + r.atom}
            language={language}
            title={zh ? "原子面积" : "Atom areas"}
            compare={false}
            initialSort={{ key: "assembly", direction: "descending" }}
            exportName="atom-exposure.csv"
          />
        )}
      </div>
    </>
  );
}
