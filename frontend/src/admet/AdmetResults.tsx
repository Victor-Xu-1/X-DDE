import { useState } from "react";
import { artifactUrl } from "../api";
import { StateForm } from "../chemistry/StateForm";
import type { MoleculeRef } from "../research/types";
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
  const [next, setNext] = useState<MoleculeRef | null>(null);
  const current =
    result.rows.find((row) => row.record === selected) ?? result.rows[0];
  if (next && onCreated)
    return (
      <section>
        <button
          className="secondary-button"
          type="button"
          onClick={() => setNext(null)}
        >
          {zh ? "返回性质预测" : "Back to predictions"}
        </button>
        <StateForm
          language={language}
          onCreated={onCreated}
          initialMolecule={next}
        />
      </section>
    );
  return (
    <section
      className="admet-results"
      aria-label={zh ? "性质与早期安全性预测结果" : "ADMET prediction results"}
    >
      <div className="admet-result-toolbar">
        <p role="status">
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
      {current ? (
        <div className="admet-workspace">
          <AdmetCandidateViews
            result={result}
            language={language}
            selected={current.record}
            onSelect={(row) => setSelected(row.record)}
          />
          <AdmetSelectedMolecule
            key={current.record}
            job={job}
            result={result}
            row={current}
            language={language}
            onPrepare={onCreated ? setNext : undefined}
          />
        </div>
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
  );
}
