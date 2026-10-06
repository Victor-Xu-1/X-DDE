import { ChoiceCards } from "../guided/ChoiceCards";
import { Hint } from "../guided/Hint";
import { AssetPicker } from "../operations/AssetPicker";
import { DatasetPicker } from "./DatasetPicker";
import { SourcePicker } from "./SourcePicker";
import { ResearchTable } from "./ResearchTable";
import { DELSampleDesign } from "./DELSampleDesign";
import type { DELFormState } from "./useDELForm";

export function DELScopeQuestion({ model }: { model: DELFormState }) {
  const {
    mode,
    zh,
    memberId,
    setMemberId,
    columns,
    countUnit,
    setCountUnit,
    language,
    samples,
    setSamples,
    comparisons,
    setComparisons,
    library,
    setLibrary,
    availableLibraries,
    members,
    allMembers,
    setAllMembers,
    setMembers,
    comparison,
    setComparison,
    availableComparisons,
    source,
    selected,
    setSelected,
    sampleName,
    setSampleName,
    valueColumn,
    setValueColumn,
    definition,
  } = model;
  return (
    <div className="dataset-question-content">
      {mode === "analyze" ? (
        <>
          <div className="dataset-field-grid">
            <label className="field">
              {zh ? "成员编号列" : "Member-ID column"}
              <select
                value={memberId}
                onChange={(e) => setMemberId(e.target.value)}
              >
                {columns.map((column) => (
                  <option key={column}>{column}</option>
                ))}
              </select>
            </label>
            <label className="field">
              {zh ? "计数来源" : "Count unit"}
              <select
                value={countUnit}
                onChange={(e) => setCountUnit(e.target.value)}
              >
                <option value="corrected_umi">
                  {zh ? "纠错后的 UMI" : "Corrected UMIs"}
                </option>
                <option value="unique_umi">
                  {zh ? "独立 UMI" : "Unique UMIs"}
                </option>
                <option value="reads">{zh ? "原始读段" : "Raw reads"}</option>
              </select>
            </label>
          </div>
          <DELSampleDesign
            language={language}
            columns={columns}
            samples={samples}
            onChange={setSamples}
            comparisons={comparisons}
            onComparisons={setComparisons}
          />
        </>
      ) : mode === "enumerate" ? (
        <>
          <label className="field">
            {zh ? "选择 DEL 库" : "DEL library"}
            <select
              value={library}
              onChange={(e) => setLibrary(e.target.value)}
            >
              {availableLibraries.map((item) => (
                <option key={item.library} value={item.library}>
                  {item.library} · {item.members.toLocaleString()}
                </option>
              ))}
            </select>
          </label>
          <label className="dataset-confirm">
            <input
              type="checkbox"
              checked={allMembers}
              onChange={(e) => setAllMembers(e.target.checked)}
            />
            {zh
              ? "解析整个库（限所设规模）"
              : "Enumerate the complete library within the confirmed budget"}
          </label>
          {!allMembers && (
            <label className="field">
              {zh
                ? "每行填写各周期砌块编号，逗号分隔"
                : "One member per line; comma-separated cycle IDs"}
              <textarea
                value={members}
                onChange={(e) => setMembers(e.target.value)}
                placeholder="A035,B040,C030"
                rows={5}
              />
            </label>
          )}
        </>
      ) : mode === "candidates" ? (
        <>
          <label className="field">
            {zh ? "比较" : "Comparison"}
            <select
              value={comparison}
              onChange={(e) => setComparison(e.target.value)}
            >
              {availableComparisons.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.selection} / {item.reference}
                </option>
              ))}
            </select>
          </label>
          {source[0] && (
            <ResearchTable
              jobId={source[0].job_id}
              view="enrichment"
              comparison={comparison}
              language={language}
              selection={selected}
              onSelection={setSelected}
            />
          )}
        </>
      ) : mode === "decode" ? (
        <label className="field">
          {zh ? "样本名称" : "Sample name"}
          <input
            value={sampleName}
            onChange={(e) =>
              setSampleName(e.target.value.replace(/[^A-Za-z0-9_-]/g, "_"))
            }
          />
        </label>
      ) : mode === "followup" ? (
        <div className="dataset-field-grid">
          <label className="field">
            {zh ? "成员编号列" : "Member-ID column"}
            <select
              value={memberId}
              onChange={(e) => setMemberId(e.target.value)}
            >
              {columns.map((column) => (
                <option key={column}>{column}</option>
              ))}
            </select>
          </label>
          <label className="field">
            {zh ? "测量值列" : "Measurement column"}
            <select
              value={valueColumn}
              onChange={(e) => setValueColumn(e.target.value)}
            >
              {columns.map((column) => (
                <option key={column}>{column}</option>
              ))}
            </select>
          </label>
        </div>
      ) : ["series", "model"].includes(mode) ? (
        <label className="field">
          {zh ? "选择实际计算的比较" : "Computed comparison"}
          <select
            value={comparison}
            onChange={(e) => setComparison(e.target.value)}
          >
            {availableComparisons.map((item) => (
              <option key={item.id} value={item.id}>
                {item.selection} / {item.reference}
              </option>
            ))}
          </select>
        </label>
      ) : (
        <div className="dataset-plan-choice">
          <strong>{definition.label[zh ? 0 : 1]}</strong>
        </div>
      )}
    </div>
  );
}
