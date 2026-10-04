import { useState } from "react";
import type { Job, Language } from "../types";
import type { MoleculeRef } from "../research/types";
import type { StateResult, StateSet } from "./types";
import { artifactUrl } from "../api";
import { ResearchTable } from "../presentation/ResearchTable";
import { MoleculeImage } from "../presentation/MoleculeImage";
import { MolecularPreview } from "../presentation/MolecularPreview";
import { MetricScatter } from "../presentation/MetricScatter";

export function StateCollectionPreview({
  job,
  data,
  sets,
  language,
  onUse,
}: {
  job: Job;
  data: StateResult;
  sets: StateSet[];
  language: Language;
  onUse(reference: MoleculeRef, kind: "properties" | "docking"): void;
}) {
  const zh = language === "zh";
  const [stateIndex, setState] = useState(data.states[0]?.index);
  const [record, setRecord] = useState<number | null>(null);
  const state = data.states.find((value) => value.index === stateIndex);
  const conformers = data.conformers.filter(
    (value) => value.state_index === stateIndex,
  );
  const current =
    conformers.find((value) => value.record === record) ?? conformers[0];
  const member = sets
    .flatMap((set) => set.members)
    .find((value) => value.evidence.index === stateIndex);
  const reference = member?.conformers.find(
    (value) => value.evidence.record === current?.record,
  )?.reference;
  if (!state) return null;
  return (
    <section className="state-collection-preview">
      <ResearchTable
        rows={data.states}
        language={language}
        title={zh ? "化学状态" : "Chemical states"}
        rowId={(value) => String(value.index)}
        selected={String(stateIndex)}
        compare={false}
        onSelect={(value) => {
          setState(value.index);
          setRecord(null);
        }}
        columns={[
          {
            key: "state",
            label: zh ? "状态" : "State",
            value: (value) => (zh ? "状态 " : "State ") + (value.index + 1),
          },
          {
            key: "structure",
            label: zh ? "二维结构" : "2D structure",
            value: (value) => value.smiles,
            sortable: false,
            render: (value) => (
              <button
                type="button"
                className="molecule-record"
                aria-label={
                  (zh ? "选择状态 " : "Select state ") + (value.index + 1)
                }
                onClick={() => {
                  setState(value.index);
                  setRecord(null);
                }}
              >
                <MoleculeImage
                  compact
                  source={{ smiles: value.smiles }}
                  language={language}
                  label={String(value.index + 1)}
                />
              </button>
            ),
          },
          {
            key: "formula",
            label: zh ? "分子式" : "Formula",
            value: (value) => value.formula,
          },
          {
            key: "charge",
            label: zh ? "形式电荷" : "Formal charge",
            value: (value) => value.charge,
            numeric: true,
          },
          {
            key: "conformers",
            label: zh ? "构象数" : "Conformers",
            value: (value) =>
              data.conformers.filter((c) => c.state_index === value.index)
                .length,
            numeric: true,
          },
        ]}
      />
      <div className="result-master-detail state-conformer-stage">
        <div className="result-inspector">
          <ResearchTable
            rows={conformers}
            language={language}
            title={zh ? "本状态的游离构象" : "Free conformers in this state"}
            rowId={(value) => String(value.record)}
            selected={current ? String(current.record) : null}
            compare={false}
            onSelect={(value) => setRecord(value.record)}
            columns={[
              {
                key: "conformer",
                label: zh ? "构象" : "Conformer",
                value: (value) =>
                  (zh ? "构象 " : "Conformer ") + (value.native_conformer + 1),
              },
              {
                key: "energy",
                label: zh
                  ? "力场能量 (kcal/mol)"
                  : "Force-field energy (kcal/mol)",
                value: (value) => value.energy,
                numeric: true,
              },
              {
                key: "converged",
                label: zh ? "最小化状态" : "Minimization",
                value: (value) =>
                  value.converged === null
                    ? zh
                      ? "未最小化"
                      : "Not minimized"
                    : value.converged
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
            label={zh ? "本状态的构象能量" : "Conformer energies in this state"}
            rowId={(value) => String(value.record)}
            rowLabel={(value) =>
              (zh ? "构象 " : "Conformer ") + (value.native_conformer + 1)
            }
            selected={current ? String(current.record) : null}
            onSelect={(value) => setRecord(value.record)}
            metrics={[
              {
                key: "conformer",
                label: zh ? "构象编号" : "Conformer number",
                value: (value) => value.native_conformer + 1,
              },
              {
                key: "energy",
                label: zh
                  ? "力场能量 (kcal/mol)"
                  : "Force-field energy (kcal/mol)",
                value: (value) => value.energy,
              },
            ]}
          />
        </div>
        <div className="result-inspector">
          <header>
            <h3>
              {zh ? "状态" : "State"} {state.index + 1}
              {current
                ? " · " +
                  (zh ? "构象 " : "Conformer ") +
                  (current.native_conformer + 1)
                : ""}
            </h3>
          </header>
          <MolecularPreview
            key={String(state.index) + ":" + String(current?.record)}
            label={String(state.index + 1)}
            language={language}
            source={{ smiles: state.smiles }}
            defaultView={current ? "3d" : "2d"}
            urls={current ? [artifactUrl(job.id, current.artifact)] : undefined}
            records={current ? [0] : undefined}
          />
          {current && (
            <a href={artifactUrl(job.id, current.artifact)} download>
              {zh ? "下载当前构象 SDF" : "Download current conformer SDF"}
            </a>
          )}
          <div className="editor-toolbar">
            {member?.reference && (
              <button
                type="button"
                className="secondary-button"
                onClick={() => onUse(member.reference, "properties")}
              >
                {zh ? "计算此状态性质" : "Calculate this state's properties"}
              </button>
            )}
            {reference && (
              <button
                type="button"
                className="secondary-button"
                onClick={() => onUse(reference, "docking")}
              >
                {zh ? "用于寻找结合姿势" : "Use for binding-pose search"}
              </button>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
