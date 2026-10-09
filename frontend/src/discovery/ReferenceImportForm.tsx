import { useState } from "react";
import { useExample } from "../examples/context";
import { ChoiceCards } from "../guided/ChoiceCards";
import { Questionnaire } from "../guided/Questionnaire";
import { Hint } from "../guided/Hint";
import { useTaskReadiness } from "../guided/useTaskReadiness";
import { useTaskSubmit } from "../operations/useTaskSubmit";
import type { MoleculeRef } from "../research/types";
import type { Job, Language } from "../types";

export interface ReferenceSelection {
  source: "pdb" | "chembl";
  identifier: string;
  evidence?: MoleculeRef;
  activity_id?: number;
}
export function ReferenceImportForm({
  language,
  onCreated,
  initial,
}: {
  language: Language;
  onCreated(job: Job): void;
  initial?: ReferenceSelection;
}) {
  const example = useExample();
  initial ??= example
    ? {
        source: "pdb",
        identifier:
          example.case.evidence_entities?.structure?.id ??
          (example.case.id === "trastuzumab-her2" ? "1N8Z" : "3MXF"),
      }
    : undefined;
  const zh = language === "zh",
    run = useTaskSubmit(onCreated),
    { ready, error } = useTaskReadiness("discovery.import");
  const [source, setSource] = useState<"pdb" | "chembl">(
      initial?.source ?? "pdb",
    ),
    [identifier, setIdentifier] = useState(initial?.identifier ?? ""),
    [linked, setLinked] = useState(Boolean(initial?.evidence)),
    [format, setFormat] = useState<"cif" | "pdb" | "sdf">(
      initial?.source === "chembl" ? "sdf" : "cif",
    ),
    [consent, setConsent] = useState(false),
    [name, setName] = useState("");
  const selected = identifier.trim().toUpperCase();
  const valid =
    source === "pdb"
      ? /^(?:[0-9][A-Z0-9]{3}|PDB_[A-Z0-9]{8})$/.test(selected)
      : /^CHEMBL[0-9]{1,12}$/.test(selected);
  const formatValid =
    source === "chembl"
      ? format === "sdf"
      : format !== "sdf" && (!selected.startsWith("PDB_") || format === "cif");
  const evidence = linked ? initial?.evidence : undefined;
  return (
    <Questionnaire
      language={language}
      ready={ready && consent}
      busy={run.busy}
      error={error || run.error}
      unavailable={
        zh
          ? "请确认允许查询所选公共资料来源。"
          : "Confirm retrieval from the selected public archive."
      }
      submitLabel={zh ? "导入研究材料" : "Import research material"}
      onSubmit={() =>
        run.submit({
          operation: "reference_import",
          name: name.trim() || selected,
          source,
          identifier: selected,
          format,
          allow_external: true,
          evidence: evidence ?? null,
          scientific_inputs: evidence ? [evidence] : [],
          activity_id:
            evidence && source === "chembl"
              ? (initial?.activity_id ?? null)
              : null,
        })
      }
      steps={[
        {
          title: zh ? "选择材料" : "Choose material",
          valid: true,
          content: (
            <ChoiceCards<"pdb" | "chembl">
              label={zh ? "想导入哪种参考材料？" : "Which reference material?"}
              value={source}
              onChange={(value) => {
                setSource(value);
                setIdentifier("");
                setLinked(false);
                setFormat(value === "pdb" ? "cif" : "sdf");
              }}
              options={[
                {
                  value: "pdb",
                  title: zh ? "实验结构" : "Experimental structure",
                  note: zh
                    ? "从 PDB 获取蛋白、核酸或复合物原始结构。"
                    : "Retrieve original protein, nucleic-acid or complex structures from PDB.",
                },
                {
                  value: "chembl",
                  title: zh ? "已知化合物" : "Known compound",
                  note: zh
                    ? "从 ChEMBL 获取指定化合物的原始 SDF 记录。"
                    : "Retrieve an original ChEMBL molecular SDF record.",
                },
              ]}
            />
          ),
        },
        {
          title: zh ? "选择记录" : "Select the record",
          valid,
          content: (
            <>
              <label className="field">
                {source === "pdb"
                  ? zh
                    ? "PDB 编号"
                    : "PDB accession"
                  : zh
                    ? "ChEMBL 化合物编号"
                    : "ChEMBL molecule accession"}
                <input
                  value={identifier}
                  maxLength={24}
                  placeholder={source === "pdb" ? "1CRN" : "CHEMBL25"}
                  onChange={(e) => {
                    setIdentifier(e.target.value);
                    setLinked(false);
                  }}
                />
              </label>
              {linked && (
                <p className="field-help">
                  {zh
                    ? "已关联所选靶点证据与确切实验记录。"
                    : "Linked to the selected target evidence and exact assay record."}
                </p>
              )}
              <Hint
                label={
                  zh
                    ? "编号从哪里来？"
                    : "Where does this identifier come from?"
                }
              >
                {zh
                  ? "在靶点证据结果中点选结构或化合物可自动填写。此处不接受下载网址或本机路径。"
                  : "Choose a structure or compound in target evidence results to prefill it. Download URLs and local paths are not accepted."}
              </Hint>
            </>
          ),
        },
        {
          title: zh ? "选择保存方式" : "Choose format",
          valid: formatValid,
          content: (
            <>
              {source === "pdb" ? (
                <ChoiceCards<"cif" | "pdb" | "sdf">
                  label={zh ? "用哪种结构格式？" : "Which structure format?"}
                  value={format}
                  onChange={setFormat}
                  options={[
                    {
                      value: "cif",
                      title: zh
                        ? "保留完整信息（推荐）"
                        : "Preserve complete information (recommended)",
                      note: zh
                        ? "保存原始 mmCIF；后续任务按支持的模型、链与格式准备。"
                        : "Original mmCIF; prepare models, chains and formats for the next tool.",
                    },
                    {
                      value: "pdb",
                      title: zh ? "使用 PDB 兼容格式" : "Use legacy PDB format",
                      note: zh
                        ? "适合只接受 PDB 的工具；档案未提供时会明确失败，不静默转换。"
                        : "For PDB-only tools; missing archive format fails explicitly, without silent conversion.",
                    },
                  ]}
                />
              ) : (
                <p>
                  {zh
                    ? "保存原始 SDF；它可能是二维结构，后续可在“分子准备”生成游离三维构象。"
                    : "Save original SDF, which may contain 2D geometry. Prepare free 3D conformers in Molecule preparation."}
                </p>
              )}
              <details>
                <summary>{zh ? "记录选项" : "Record options"}</summary>
                <label className="field">
                  {zh ? "任务名称（可选）" : "Task name (optional)"}
                  <input
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    maxLength={80}
                  />
                </label>
              </details>
            </>
          ),
        },
        {
          title: zh ? "确认导入" : "Review import",
          valid: valid && formatValid && consent,
          content: (
            <>
              <dl className="questionnaire-review">
                <dt>{zh ? "材料" : "Material"}</dt>
                <dd>
                  {source === "pdb" ? "RCSB PDB" : "ChEMBL"} · {selected}
                </dd>
                <dt>{zh ? "格式" : "Format"}</dt>
                <dd>{format.toUpperCase()}</dd>
                <dt>{zh ? "处理方式" : "Processing"}</dt>
                <dd>
                  {zh
                    ? "保留原始字节和坐标；登记新资产版本，不覆盖已有材料。"
                    : "Preserve original bytes/coordinates and register a new asset; existing materials stay intact."}
                </dd>
              </dl>
              <label className="checkbox-line">
                <input
                  type="checkbox"
                  checked={consent}
                  onChange={(e) => setConsent(e.target.checked)}
                />
                {zh
                  ? "允许按此编号获取公共数据库记录"
                  : "Allow retrieving this public database record"}
              </label>
              <Hint
                label={
                  zh
                    ? "导入后的材料是否已经准备好？"
                    : "Is imported material already prepared?"
                }
              >
                {zh
                  ? "导入不等于完成结构准备、质子化、口袋确认或对接。后续任务会检查实际文件和确切版本。"
                  : "Import does not establish preparation, protonation, pocket validation or docking. Subsequent tasks validate the actual file/version."}
              </Hint>
            </>
          ),
        },
      ]}
    />
  );
}
