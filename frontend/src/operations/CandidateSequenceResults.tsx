import { useState } from "react";
import type { Job, Language } from "../types";
import { artifactUrl } from "../api";
import { ResearchTable } from "../presentation/ResearchTable";
import { ResearchTabs } from "../presentation/ResearchTabs";
import { SequenceTrack } from "../presentation/SequenceTrack";
import { MetricScatter } from "../presentation/MetricScatter";
import { StructureViewer } from "../viewer/StructureViewer";
import { ResultTree } from "./StructuredResults";
import {
  candidateChains,
  candidateMetrics,
  candidateMetricLabel,
  record,
} from "./candidate-sequence-model";
import { mutationDescription } from "./sequence-result";
import { candidateStructure } from "./candidate-structures";
import "./candidate-results.css";

export function CandidateSequenceResults({
  job,
  candidates,
  structures,
  language,
}: {
  job: Job;
  candidates: Record<string, unknown>[];
  structures: string[];
  language: Language;
}) {
  const zh = language === "zh",
    [selected, setSelected] = useState(0);
  const rows = candidates.map((value, index) => ({
    value,
    index,
    metrics: candidateMetrics(value),
    chains: candidateChains(value),
  }));
  const current = rows.find((row) => row.index === selected) ?? rows[0];
  if (!current) return null;
  const keys = [...new Set(rows.flatMap((row) => Object.keys(row.metrics)))];
  const structure = candidateStructure(current.value, structures);
  const claimed = new Set(
    rows.flatMap((row) => {
      const file = candidateStructure(row.value, structures);
      return file ? [file] : [];
    }),
  );
  const unassigned = [...new Set(structures)].filter(
    (name) => !claimed.has(name),
  );
  const candidateLabel = (row: typeof current) =>
    typeof row.value.candidate_id === "string" && row.value.candidate_id.trim()
      ? row.value.candidate_id
      : (zh ? "候选 " : "Candidate ") + (row.index + 1);
  const payload =
    job.request.operation === "harness" ? job.request.payload : {};
  const original = record(payload.parent_chains);
  const tree = (
    <div className="result-inspector">
      {current.chains.map(({ chain, sequence }) => (
        <section key={chain} className="candidate-chain-view">
          {typeof original[chain] === "string" && (
            <SequenceTrack
              sequence={original[chain] as string}
              language={language}
              label={
                (zh ? "原始序列" : "Original sequence") +
                (chain ? " · " + chain : "")
              }
            />
          )}
          <SequenceTrack
            sequence={sequence}
            language={language}
            label={
              (zh ? "候选序列" : "Candidate sequence") +
              (chain ? " · " + chain : "")
            }
          />
          {typeof original[chain] === "string" &&
            (original[chain] as string).length === sequence.length && (
              <p className="field-help">
                {zh
                  ? "与原始序列不同的位置："
                  : "Positions differing from the original: "}
                {Array.from(sequence)
                  .flatMap((aa, index) =>
                    (original[chain] as string)[index] !== aa
                      ? [
                          String(index + 1) +
                            " " +
                            (original[chain] as string)[index] +
                            "→" +
                            aa,
                        ]
                      : [],
                  )
                  .join(" · ") || (zh ? "无" : "None")}
              </p>
            )}
        </section>
      ))}
    </div>
  );
  const tabs = [
    {
      id: "sequence",
      label: zh ? "序列对照" : "Sequence comparison",
      content: tree,
    },
  ];
  if (structure)
    tabs.unshift({
      id: "structure",
      label: zh ? "三维结构" : "3D structure",
      content: (
        <StructureViewer
          language={language}
          urls={[artifactUrl(job.id, structure)]}
          initialMode="cartoon"
          ligandContext={
            job.request.operation !== "harness" || job.request.tool !== "fold"
          }
        />
      ),
    });
  return (
    <section className="sequence-candidate-results">
      <p className="field-help">
        {zh
          ? "模型结果；序列、界面与结构评分不等于实验结合活性。"
          : "Model outputs; sequence, interface and structure scores are not measured binding activity."}
      </p>
      <div className="result-master-detail">
        <div className="result-inspector">
          <ResearchTable
            rows={rows}
            language={language}
            title={zh ? "序列候选" : "Sequence candidates"}
            rowId={(row) => String(row.index)}
            selected={String(current.index)}
            onSelect={(row) => setSelected(row.index)}
            initialVisibleColumns={[
              "candidate",
              "length",
              ...["iptm", "plddt", "esm2_llr"].filter((key) =>
                keys.includes(key),
              ),
            ]}
            columns={[
              {
                key: "candidate",
                label: zh ? "候选" : "Candidate",
                value: candidateLabel,
              },
              {
                key: "length",
                label: zh ? "总长度 (aa)" : "Total length (aa)",
                value: (row) =>
                  row.chains.length
                    ? row.chains.reduce(
                        (sum, chain) => sum + chain.sequence.length,
                        0,
                      )
                    : null,
                numeric: true,
              },
              ...keys.map((key) => ({
                key,
                label: candidateMetricLabel(key),
                numeric: true,
                value: (row: (typeof rows)[number]) => row.metrics[key] ?? null,
              })),
            ]}
          />
          {keys.length > 0 && rows.length > 1 && (
            <MetricScatter
              rows={rows}
              language={language}
              label={zh ? "候选指标比较" : "Candidate metric comparison"}
              rowId={(row) => String(row.index)}
              rowLabel={candidateLabel}
              selected={String(current.index)}
              onSelect={(row) => setSelected(row.index)}
              metrics={[
                {
                  key: "candidate",
                  label: zh ? "候选编号" : "Candidate number",
                  value: (row) => row.index + 1,
                },
                ...keys.map((key) => ({
                  key,
                  label: candidateMetricLabel(key),
                  value: (row: (typeof rows)[number]) =>
                    row.metrics[key] ?? null,
                })),
              ]}
            />
          )}
        </div>
        <div className="result-inspector">
          <header>
            <h3>{candidateLabel(current)}</h3>
          </header>
          <ResearchTabs
            key={current.index}
            label={zh ? "候选预览" : "Candidate views"}
            tabs={tabs}
          />
          {Array.isArray(current.value.mutations) && (
            <p>
              {zh
                ? "变更（序列位置从 1 开始）"
                : "Changes (sequence positions start at 1)"}
              : {current.value.mutations.map(mutationDescription).join("; ")}
            </p>
          )}
          <details>
            <summary>
              {zh ? "设计依据与完整指标" : "Design evidence and full metrics"}
            </summary>
            <ResultTree
              zh={zh}
              value={{
                metrics: current.metrics,
                strategy: current.value.strategy,
                objective: current.value.objective,
                risk_level: current.value.risk_level,
              }}
            />
          </details>
        </div>
      </div>
      {unassigned.length > 0 && (
        <details className="candidate-unassigned">
          <summary>
            {zh ? "其他结构文件" : "Other structure files"} ·{" "}
            {unassigned.length}
          </summary>
          <p className="field-help">
            {zh
              ? "这些文件尚未明确关联到候选，按原始结构单独查看。"
              : "These files have no explicit candidate link and are inspected independently."}
          </p>
          {unassigned.map((name) => (
            <details key={name}>
              <summary>{name}</summary>
              <StructureViewer
                urls={[artifactUrl(job.id, name)]}
                language={language}
                initialMode="cartoon"
              />
            </details>
          ))}
        </details>
      )}
    </section>
  );
}
