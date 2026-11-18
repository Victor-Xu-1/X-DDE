import { useState } from "react";
import { artifactUrl } from "../api";
import { MetricScatter } from "../presentation/MetricScatter";
import { MoleculeImage } from "../presentation/MoleculeImage";
import { ResearchTable } from "../presentation/ResearchTable";
import { ResearchTabs } from "../presentation/ResearchTabs";
import type { Language } from "../types";
import type { PreparedConformer, PreparedState, StateResult } from "./types";

export function StateInspectionTables({
  jobId,
  data,
  language,
  state,
  conformers,
  selected,
  onSelection,
}: {
  jobId: string;
  data: StateResult;
  language: Language;
  state: PreparedState;
  conformers: PreparedConformer[];
  selected?: PreparedConformer;
  onSelection(state: number, record: number | null): void;
}) {
  const zh = language === "zh";
  const [tab, setTab] = useState<string>();
  const stateLabel = (row: PreparedState) =>
    (zh ? "状态 " : "State ") + (row.index + 1);
  const conformerLabel = (row: PreparedConformer) =>
    (zh ? "构象 " : "Conformer ") + (row.native_conformer + 1);
  const selectState = (row: PreparedState) => onSelection(row.index, null);
  const selectConformer = (row: PreparedConformer) =>
    onSelection(state.index, row.record);
  const rowId = (row: PreparedConformer) => String(row.record);
  const selectedRecord = selected ? rowId(selected) : null;
  const energy = {
    key: "energy",
    label: zh ? "力场能量 (kcal/mol)" : "Force-field energy (kcal/mol)",
    value: (row: PreparedConformer) => row.energy,
    numeric: true,
  };
  return (
    <ResearchTabs
      label={zh ? "状态与构象数据" : "State and conformer data"}
      active={tab ?? (conformers.length ? "conformers" : "states")}
      onChange={setTab}
      tabs={[
        {
          id: "states",
          label: zh ? "化学状态" : "Chemical states",
          count: data.states.length,
          content: (
            <ResearchTable
              rows={data.states}
              language={language}
              title={zh ? "化学状态" : "Chemical states"}
              rowId={(row) => String(row.index)}
              selected={String(state.index)}
              compare={false}
              onSelect={selectState}
              columns={[
                {
                  key: "state",
                  label: zh ? "状态" : "State",
                  value: stateLabel,
                },
                {
                  key: "structure",
                  label: zh ? "二维结构" : "2D structure",
                  value: (row) => row.smiles,
                  sortable: false,
                  render: (row) => (
                    <button
                      type="button"
                      className="molecule-record"
                      aria-label={(zh ? "选择" : "Select ") + stateLabel(row)}
                      onClick={() => selectState(row)}
                    >
                      <MoleculeImage
                        compact
                        source={{
                          url: artifactUrl(jobId, data.state_artifact),
                          record: row.index,
                          sha256: data.artifact_sha256[data.state_artifact],
                        }}
                        language={language}
                        label={String(row.index + 1)}
                      />
                    </button>
                  ),
                },
                {
                  key: "formula",
                  label: zh ? "分子式" : "Formula",
                  value: (row) => row.formula,
                },
                {
                  key: "charge",
                  label: zh ? "形式电荷" : "Formal charge",
                  value: (row) => row.charge,
                  numeric: true,
                },
                {
                  key: "conformers",
                  label: zh ? "构象数" : "Conformers",
                  value: (row) =>
                    data.conformers.filter((c) => c.state_index === row.index)
                      .length,
                  numeric: true,
                },
              ]}
            />
          ),
        },
        {
          id: "conformers",
          label: zh ? "游离构象" : "Free conformers",
          count: conformers.length,
          content: (
            <>
              <ResearchTable
                rows={conformers}
                language={language}
                title={
                  zh ? "本状态的游离构象" : "Free conformers in this state"
                }
                rowId={rowId}
                selected={selectedRecord}
                compare={false}
                onSelect={selectConformer}
                columns={[
                  {
                    key: "conformer",
                    label: zh ? "构象" : "Conformer",
                    value: conformerLabel,
                  },
                  energy,
                  {
                    key: "converged",
                    label: zh ? "最小化状态" : "Minimization",
                    value: ({ converged }) =>
                      converged === null
                        ? zh
                          ? "未最小化"
                          : "Not minimized"
                        : converged
                          ? zh
                            ? "已收敛"
                            : "Converged"
                          : zh
                            ? "未收敛"
                            : "Not converged",
                  },
                ]}
              />
              <MetricScatter
                rows={conformers}
                language={language}
                label={
                  zh ? "本状态的构象能量" : "Conformer energies in this state"
                }
                rowId={rowId}
                rowLabel={conformerLabel}
                selected={selectedRecord}
                onSelect={selectConformer}
                metrics={[
                  {
                    key: "conformer",
                    label: zh ? "构象编号" : "Conformer number",
                    value: (row) => row.native_conformer + 1,
                  },
                  energy,
                ]}
              />
            </>
          ),
        },
      ]}
    />
  );
}
