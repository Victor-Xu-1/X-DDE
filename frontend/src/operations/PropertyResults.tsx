import { useState } from "react";
import type { Job, Language, LigandProperties, Prediction } from "../types";
import { defaults } from "../form-model";
import {
  ResearchTable,
  type ResearchColumn,
} from "../presentation/ResearchTable";
import { MoleculeImage } from "../presentation/MoleculeImage";
import { MetricScatter } from "../presentation/MetricScatter";
import { MolecularPreview } from "../presentation/MolecularPreview";
import { MetricHelp, type metrics } from "../guided/MetricHelp";
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
  const [selection, setSelection] = useState(
    rows.find((row) => row.available)?.index ?? 0,
  );
  const current = rows.find((row) => row.index === selection);
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
      value: (row) => (zh ? "分子 " : "Molecule ") + (row.index + 1),
      render: (row) => (
        <button
          type="button"
          className="molecule-record"
          aria-label={(zh ? "分子 " : "Molecule ") + (row.index + 1)}
          aria-pressed={selection === row.index}
          onClick={() => setSelection(row.index)}
        >
          <MoleculeImage
            compact
            source={row.smiles ? { smiles: row.smiles } : null}
            language={language}
            label={String(row.index + 1)}
          />
          <span>
            <strong>
              {zh ? "分子" : "Molecule"} {row.index + 1}
            </strong>
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
  return (
    <section className="properties-results">
      <p className="field-help">
        {zh
          ? "RDKit 计算描述符 · 点击分子或散点查看结构；QED 和 SA 不代表实测药效。"
          : "RDKit descriptors · select a molecule or plot point to inspect its structure. QED and SA are not measured potency."}
      </p>
      <div className="result-master-detail">
        <ResearchTable
          rows={rows}
          columns={columns}
          rowId={(row) => String(row.index)}
          title={zh ? "分子性质 · RDKit 计算" : "Molecular properties · RDKit"}
          language={language}
          selected={String(selection)}
        />
        <div className="result-inspector">
          {current && (
            <>
              <header>
                <h3>
                  {zh ? "分子" : "Molecule"} {current.index + 1}
                </h3>
                {current.available && current.smiles && onDraft && (
                  <button
                    type="button"
                    className="secondary-button"
                    onClick={() =>
                      onDraft({
                        name: (
                          job.request.name +
                          " · " +
                          (current.index + 1)
                        ).slice(0, 80),
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
              </header>
              {current.available && current.smiles ? (
                <MolecularPreview
                  language={language}
                  label={String(current.index + 1)}
                  source={{ smiles: current.smiles }}
                />
              ) : (
                <p role="status">{current.reason}</p>
              )}
            </>
          )}
          <MetricScatter<Row>
            rows={rows}
            language={language}
            label={zh ? "性质分布" : "Property landscape"}
            rowId={(row) => String(row.index)}
            rowLabel={(row) => (zh ? "分子 " : "Molecule ") + (row.index + 1)}
            selected={String(selection)}
            onSelect={(row) => setSelection(row.index)}
            metrics={numeric.map((m) => ({
              ...m,
              value: (row) => (row.available ? row[m.key] : null),
            }))}
          />
        </div>
      </div>
    </section>
  );
}
