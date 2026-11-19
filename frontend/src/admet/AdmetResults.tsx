import { StructureWorkbench } from "../presentation/StructureWorkbench";
import { useState } from "react";
import { PoseSession } from "../viewer/PoseSession";
import { artifactUrl } from "../api";
import {
  StatePreparationHandoff,
  useStatePreparation,
} from "../chemistry/StatePreparationHandoff";
import type { Job, Language } from "../types";
import type { AdmetResult } from "./types";
import { AdmetCandidateViews } from "./AdmetCandidateViews";
import { AdmetSelectedMolecule } from "./AdmetSelectedMolecule";
import "./admet.css";

type Props = {
  job: Job;
  result: AdmetResult;
  language: Language;
  onCreated?(job: Job): void;
};

export function AdmetResults(props: Props) {
  return <AdmetWorkspace key={props.job.id} {...props} />;
}

function AdmetWorkspace({ job, result, language, onCreated }: Props) {
  const zh = language === "zh";
  const [selected, setSelected] = useState(
    result.rows.find((row) => row.status === "predicted")?.record ??
      result.rows[0]?.record,
  );
  const preparation = useStatePreparation();
  const current =
    result.rows.find((row) => row.record === selected) ?? result.rows[0];
  const url = current?.preview ? artifactUrl(job.id, current.preview) : null;
  const frame = {
    urls: url ? [url] : [],
    molecularSource: url ? { url, record: 0 } : undefined,
    comparison: false,
  };
  const handoff = onCreated && preparation.input;
  return (
    <PoseSession frame={frame}>
      <div className="preparation-origin" hidden={Boolean(handoff)}>
        <section
          className="admet-results"
          aria-label={
            result.focus === "brain"
              ? zh
                ? "透脑评估结果"
                : "Brain-penetration assessment results"
              : zh
                ? "性质与早期安全性预测结果"
                : "ADMET prediction results"
          }
        >
          {!current && (
            <div className="admet-result-toolbar">
              <p role="status">
                <strong>ADMET-AI</strong> {result.versions["admet-ai"]}
                {" · "}
                {zh ? "已预测" : "Predicted"} {result.predicted_count} /{" "}
                {result.rows.length}
              </p>
              <a
                className="secondary-button"
                href={artifactUrl(job.id, "predictions.csv")}
                download
              >
                {zh ? "下载预测表" : "Download prediction table"}
              </a>
            </div>
          )}
          {current ? (
            <StructureWorkbench
              preview={
                <AdmetSelectedMolecule
                  key={current.record}
                  job={job}
                  result={result}
                  row={current}
                  language={language}
                  onPrepare={
                    onCreated
                      ? (reference, trigger) =>
                          preparation.open(
                            reference,
                            `#${current.record + 1} · ${current.name}`,
                            trigger,
                          )
                      : undefined
                  }
                />
              }
            >
              <AdmetCandidateViews
                result={result}
                language={language}
                row={current}
                onSelect={(row) => setSelected(row.record)}
              />
            </StructureWorkbench>
          ) : (
            <div className="admet-empty">
              <h3>{zh ? "没有分子结果" : "No molecule results"}</h3>
              <p>
                {zh
                  ? "请检查输入文件中是否有可读取的分子记录。"
                  : "Check that the input file contains readable molecule records."}
              </p>
            </div>
          )}
        </section>
      </div>
      {handoff && onCreated && (
        <StatePreparationHandoff
          input={handoff}
          language={language}
          backLabel={zh ? "返回性质预测" : "Back to predictions"}
          onBack={preparation.close}
          onCreated={onCreated}
        />
      )}
    </PoseSession>
  );
}
