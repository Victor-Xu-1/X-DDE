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
  const areas: ResearchColumn<SurfaceRow>[] = [
    {
      key: "assembly",
      label: zh ? "暴露（Å²）" : "Exposed (Å²)",
      value: (r) => r.assembly_area,
      numeric: true,
      render: (r) => r.assembly_area.toFixed(2),
    },
    {
      key: "buried",
      label: zh ? "遮挡（Å²）" : "Occluded (Å²)",
      value: (r) => r.buried_area,
      numeric: true,
      render: (r) => r.buried_area.toFixed(2),
    },
    {
      key: "isolated",
      label: zh ? "独立（Å²）" : "Isolated (Å²)",
      value: (r) => r.isolated_area,
      numeric: true,
      render: (r) => r.isolated_area.toFixed(2),
    },
  ];
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
