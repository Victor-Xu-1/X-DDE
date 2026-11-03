import { entityInfo } from "../guided/entities";
import { normalizeProtein } from "../form-model";
import type { Component, Language } from "../types";
import { MoleculeImage } from "./MoleculeImage";
import { SequenceTrack } from "./SequenceTrack";

/** Optional display metadata supplied by a form; never part of a new task schema. */
export type PreviewComponent = Component & { ligand_record?: number };

/** Current input values only. Display never changes source bytes or prepares a conformer. */
export function PredictionEntityPreview({
  item,
  index,
  language,
}: {
  item: PreviewComponent;
  index: number;
  language: Language;
}) {
  const zh = language === "zh";
  const name = entityInfo[item.kind].name[zh ? 0 : 1];
  const label = `${name} ${index + 1}`;
  const sequence = normalizeProtein(item.value);
  const polymer = ["protein", "dna", "rna"].includes(item.kind);
  const alphabet =
    item.kind === "dna"
      ? /^[ATGCNX]+$/
      : item.kind === "rna"
        ? /^[AUGCNX]+$/
        : /^[ACDEFGHIKLMNPQRSTVWYX]+$/;
  const ccd = /^CCD_[A-Za-z0-9]{1,8}$/.test(item.value.trim());
  const source = item.ligand_file
    ? {
        url: `/api/assets/${encodeURIComponent(item.ligand_file)}`,
        record: item.ligand_record,
      }
    : item.kind === "ligand" && item.value.trim() && !ccd
      ? { smiles: item.value }
      : null;
  const files = [
    [item.source_sequence, zh ? "原始序列文件" : "Source sequence file"],
    [item.unpaired_msa, zh ? "单链 MSA 文件" : "Unpaired MSA file"],
    [item.paired_msa, zh ? "配对 MSA 文件" : "Paired MSA file"],
    [item.template_hits, zh ? "模板文件" : "Template file"],
  ].filter(([id]) => Boolean(id));
  return (
    <details className="prediction-preview-entity" open={index === 0}>
      <summary>
        <span className="prediction-entity-number" aria-hidden="true">
          {index + 1}
        </span>
        <strong>{label}</strong>
        <span>
          {item.count} {zh ? "份" : item.count === 1 ? "copy" : "copies"}
        </span>
        <span className="prediction-entity-chevron" aria-hidden="true">
          ›
        </span>
      </summary>
      <div className="prediction-preview-entity-body">
        {item.chain_ids?.length || item.modifications?.length ? (
          <dl className="prediction-preview-metadata">
            {!!item.chain_ids?.length && (
              <div>
                <dt>{zh ? "链" : "Chains"}</dt>
                <dd>{item.chain_ids.join(", ")}</dd>
              </div>
            )}
            {!!item.modifications?.length && (
              <div>
                <dt>{zh ? "输入位置修饰" : "Input modifications"}</dt>
                <dd>
                  {item.modifications
                    .map((m) => `${m.position}: ${m.ccd}`)
                    .join(" · ")}
                </dd>
              </div>
            )}
          </dl>
        ) : null}
        {item.ligand_file ? (
          <>
            {item.ligand_record !== undefined && (
              <p>
                {zh ? "文件中的分子条目" : "Molecular record in file"}:{" "}
                {Number.isSafeInteger(item.ligand_record) &&
                item.ligand_record >= 0
                  ? item.ligand_record + 1
                  : "—"}
              </p>
            )}
            <MoleculeImage source={source} language={language} label={label} />
            <a
              href={`/api/assets/${encodeURIComponent(item.ligand_file)}`}
              download
            >
              {zh ? "下载已选结构文件" : "Download selected structure input"}
            </a>
          </>
        ) : polymer && alphabet.test(sequence) ? (
          <SequenceTrack
            sequence={sequence}
            language={language}
            label={label}
            unit={item.kind === "protein" ? "aa" : "nt"}
          />
        ) : item.kind === "ligand" && source ? (
          <>
            <MoleculeImage source={source} language={language} label={label} />
            <details className="prediction-preview-source">
              <summary>SMILES</summary>
              <pre>{item.value}</pre>
            </details>
          </>
        ) : item.value.trim() ? (
          <pre>{item.value}</pre>
        ) : (
          <p>
            {zh
              ? "请在任务步骤中填写这项材料。"
              : "Provide this input in the task form."}
          </p>
        )}
        {files.length > 0 && (
          <ul className="prediction-preview-files">
            {files.map(([id, name]) => (
              <li key={String(id) + name}>
                <a href={`/api/assets/${encodeURIComponent(id!)}`} download>
                  {name}
                </a>
              </li>
            ))}
          </ul>
        )}
      </div>
    </details>
  );
}
