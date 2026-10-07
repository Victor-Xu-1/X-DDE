import type { Language } from "../types";
import {
  ResearchTable,
  type ResearchColumn,
} from "../presentation/ResearchTable";
import { MoleculeImage } from "../presentation/MoleculeImage";
import { commonEndpoints, endpointName, failureReason } from "./labels";
import type { AdmetResult, AdmetRow } from "./types";
export function AdmetRecordTable({
  result,
  language,
  selected,
  onSelect,
}: {
  result: AdmetResult;
  language: Language;
  selected?: number;
  onSelect(row: AdmetRow): void;
}) {
  const zh = language === "zh";
  const endpoints = result.endpoints.filter(
    (e) =>
      result.options.view === "all" ||
      (result.options.view === "safety") === (e.category === "Toxicity"),
  );
  const columns: ResearchColumn<AdmetRow>[] = [
    {
      key: "molecule",
      label: zh ? "候选分子" : "Candidate molecule",
      value: (row) => "#" + (row.record + 1) + " · " + row.name,
      render: (row) => (
        <button
          type="button"
          className="molecule-record"
          aria-label={"#" + (row.record + 1) + " · " + row.name}
          aria-pressed={selected === row.record}
          onClick={() => onSelect(row)}
        >
          <MoleculeImage
            compact
            language={language}
            label={row.name}
            source={row.smiles ? { smiles: row.smiles } : null}
          />
          <span>
            <strong title={"#" + (row.record + 1) + " · " + row.name}>
              #{row.record + 1} · {row.name}
            </strong>
            <small>
              {row.status === "predicted"
                ? zh
                  ? "已得到模型预测"
                  : "Model predictions available"
                : failureReason(row.reason, zh)}
            </small>
            {row.duplicate_of_record != null && (
              <small>
                {zh ? "与记录相同" : "Same representation as record"} #
                {row.duplicate_of_record + 1}
              </small>
            )}
          </span>
        </button>
      ),
    },
    ...endpoints.map((e) => ({
      key: e.id,
      label: endpointName(e, zh),
      exportLabel:
        endpointName(e, zh) +
        " (" +
        (e.task_type === "classification" ? "score 0–1" : e.unit) +
        ")",
      numeric: true,
      value: (row: AdmetRow) =>
        row.status === "predicted" ? row.predictions[e.id] : null,
    })),
  ];
  const core = endpoints.filter((endpoint) => commonEndpoints.has(endpoint.id));
  const primary = (core.length ? core : endpoints).slice(0, 2);
  return (
    <ResearchTable
      rows={result.rows}
      columns={columns}
      initialVisibleColumns={[
        "molecule",
        ...primary.map((endpoint) => endpoint.id),
      ]}
      rowId={(row) => String(row.record)}
      language={language}
      title={zh ? "候选分子" : "Candidate molecules"}
      selected={selected == null ? null : String(selected)}
    />
  );
}
