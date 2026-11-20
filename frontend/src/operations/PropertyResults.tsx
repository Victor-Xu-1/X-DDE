import { StructureWorkbench } from "../presentation/StructureWorkbench";
import { useState } from "react";
import type { Job, Language, LigandProperties, Prediction } from "../types";
import { defaults } from "../form-model";
import type { ResearchColumn } from "../presentation/ResearchTable";
import { MoleculeImage } from "../presentation/MoleculeImage";
import { MolecularPreview } from "../presentation/MolecularPreview";
import { MoleculeResultToolbar } from "../presentation/MoleculeResultToolbar";
import { MetricHelp, type metrics } from "../guided/MetricHelp";
import { propertySource } from "./property-source";
import { PropertyResultViews } from "./PropertyResultViews";
type Row = LigandProperties & { index: number };
export function PropertyResults({
  job,
  molecules,
  language,
  onDraft,
}: {
  job: Job;
  molecules: LigandProperties[];
  language: Language;
  onDraft?(request: Prediction): void;
}) {
  const zh = language === "zh",
    rows = molecules.map((m, index) => ({ ...m, index }));
  const moleculeName = (row: Row) =>
    row.name?.trim() || (zh ? "分子 " : "Molecule ") + (row.index + 1);
  const [selection, setSelection] = useState(
    rows.find((row) => row.available)?.index ?? 0,
  );
  const current = rows.find((row) => row.index === selection);
  const source = current ? propertySource(job, current) : null;
  const numeric = [
    { key: "mw", label: "MW (g/mol)" },
    { key: "logp", label: "LogP" },
    { key: "tpsa", label: "TPSA (Å²)" },
    { key: "qed", label: "QED" },
    { key: "sa", label: "SA" },
    { key: "hbd", label: "HBD" },
    { key: "hba", label: "HBA" },
    { key: "rotatable_bonds", label: zh ? "可旋转键" : "Rotatable bonds" },
  ] as const;
  const columns: ResearchColumn<Row>[] = [
    {
      key: "molecule",
      label: zh ? "分子" : "Molecule",
      value: moleculeName,
      render: (row) => (
        <button
          type="button"
          className="molecule-record"
          aria-label={moleculeName(row)}
          aria-pressed={selection === row.index}
          onClick={() => setSelection(row.index)}
        >
          <MoleculeImage
            compact
            source={row.smiles ? { smiles: row.smiles } : null}
            language={language}
            label={moleculeName(row)}
          />
          <span>
            <strong>{moleculeName(row)}</strong>
            {!row.available && <small>{row.reason}</small>}
          </span>
        </button>
      ),
    },
    ...numeric.map((m) => ({
      key: m.key,
      label: (
        <>
          {m.label}
          {["mw", "logp", "tpsa", "qed", "sa"].includes(m.key) && (
            <MetricHelp
              metric={m.key as keyof typeof metrics}
              language={language}
            />
          )}
        </>
      ),
      exportLabel: m.label,
      numeric: true,
      value: (row: Row) => (row.available ? row[m.key] : null),
    })),
  ];
  const toolbar = current && (
    <MoleculeResultToolbar name={moleculeName(current)}>
      {current.available && current.smiles && onDraft && (
        <button
          type="button"
          className="secondary-button"
          onClick={() =>
            onDraft({
              name: (job.request.name + " · " + (current.index + 1)).slice(
                0,
                80,
              ),
              components: [
                { kind: "ligand", value: current.smiles!, count: 1 },
              ],
              parameters: { ...defaults, model: "standard" },
              project_id: job.request.project_id,
            })
          }
        >
          {zh ? "用此分子预测结构" : "Predict this molecule"}
        </button>
      )}
    </MoleculeResultToolbar>
  );
  return (
    <section className="properties-results">
      <StructureWorkbench
        preview={
          current && (
            <div className="result-inspector">
              {current.available && current.smiles ? (
                <MolecularPreview
                  language={language}
                  label={moleculeName(current)}
                  source={source ?? { smiles: current.smiles }}
                  urls={source ? [source.url] : undefined}
                  records={source ? [source.record] : undefined}
                  toolbar={toolbar}
                />
              ) : (
                <>
                  {toolbar}
                  <p role="status">{current.reason}</p>
                </>
              )}
            </div>
          )
        }
      >
        {current ? (
          <PropertyResultViews<Row>
            rows={rows}
            current={current}
            columns={columns}
            name={moleculeName}
            language={language}
            onSelect={(row) => setSelection(row.index)}
            metrics={numeric.map((metric) => ({
              ...metric,
              value: (row) => (row.available ? row[metric.key] : null),
            }))}
          />
        ) : (
          <p role="status">{zh ? "没有分子记录。" : "No molecule records."}</p>
        )}
      </StructureWorkbench>
    </section>
  );
}
