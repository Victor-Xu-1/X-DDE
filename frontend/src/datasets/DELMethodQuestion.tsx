import { ChoiceCards } from "../guided/ChoiceCards";
import { Hint } from "../guided/Hint";
import { SourcePicker } from "./SourcePicker";
import type { DELFormState } from "./useDELForm";
import { DELExpertSettings } from "./DELExpertSettings";

export function DELMethodQuestion({ model }: { model: DELFormState }) {
  const {
    mode,
    zh,
    umi,
    setUmi,
    minimum,
    setMinimum,
    enrichment,
    setEnrichment,
    cycleA,
    setCycleA,
    cycleB,
    setCycleB,
    endpoint,
    setEndpoint,
    setUnit,
    unit,
    definitions,
    setDefinitions,
    language,
    attachmentPolicy,
    setAttachmentPolicy,
    expert,
    setExpert,
  } = model;
  return (
    <div className="dataset-question-content">
      {mode === "count" && (
        <ChoiceCards<"directional" | "unique" | "raw">
          label={zh ? "计数方法" : "Counting method"}
          value={umi}
          onChange={setUmi}
          options={[
            {
              value: "directional",
              title: zh ? "UMI 纠错 · 推荐" : "UMI correction · Recommended",
              note: zh
                ? "在样本和成员内进行方向图纠错"
                : "Directional correction within each sample and member",
            },
            {
              value: "unique",
              title: zh ? "独立 UMI" : "Unique UMIs",
            },
            {
              value: "raw",
              title: zh ? "仅原始读段" : "Raw reads only",
              note: zh
                ? "无 UMI 时使用，保留 PCR 偏倚限制"
                : "For un-UMI'd data; PCR bias remains",
            },
          ]}
        />
      )}
      {mode === "analyze" && (
        <div className="dataset-field-grid">
          <label className="field">
            {zh ? "最低靶点计数" : "Minimum target count"}
            <select
              value={minimum}
              onChange={(e) => setMinimum(Number(e.target.value))}
            >
              <option value={5}>5</option>
              <option value={10}>10</option>
              <option value={30}>30</option>
            </select>
          </label>
          <label className="field">
            {zh ? "优先关注的富集倍数" : "Prioritization enrichment"}
            <select
              value={enrichment}
              onChange={(e) => setEnrichment(Number(e.target.value))}
            >
              <option value={2}>2×</option>
              <option value={3}>3×</option>
              <option value={5}>5×</option>
            </select>
          </label>
        </div>
      )}
      {(mode === "series" ||
        (mode === "model" && model.modelAction === "train")) && (
        <div className="dataset-field-grid">
          <label className="field">
            {zh
              ? mode === "model"
                ? "独立留出的周期"
                : "第一个周期"
              : mode === "model"
                ? "Hold-out cycle"
                : "First cycle"}
            <select
              value={cycleA}
              onChange={(e) => setCycleA(Number(e.target.value))}
            >
              {[0, 1, 2, 3, 4, 5, 6, 7].map((value) => (
                <option key={value} value={value}>
                  {value + 1}
                </option>
              ))}
            </select>
          </label>
          {mode === "series" && (
            <label className="field">
              {zh ? "第二个周期" : "Second cycle"}
              <select
                value={cycleB}
                onChange={(e) => setCycleB(Number(e.target.value))}
              >
                {[0, 1, 2, 3, 4, 5, 6, 7].map((value) => (
                  <option key={value} value={value}>
                    {value + 1}
                  </option>
                ))}
              </select>
            </label>
          )}
        </div>
      )}
      {mode === "followup" && (
        <div className="dataset-field-grid">
          <label className="field">
            {zh ? "报告的测量指标" : "Reported endpoint"}
            <select
              value={endpoint}
              onChange={(e) => {
                setEndpoint(e.target.value);
                setUnit(
                  e.target.value === "inhibition"
                    ? "percent"
                    : e.target.value === "reported_binding"
                      ? "qualitative"
                      : "nM",
                );
              }}
            >
              {["KD", "IC50", "EC50", "inhibition", "reported_binding"].map(
                (value) => (
                  <option key={value} value={value}>
                    {value === "reported_binding"
                      ? zh
                        ? "文献定性结合报告"
                        : "Qualitative binding report"
                      : value}
                  </option>
                ),
              )}
            </select>
          </label>
          <label className="field">
            {zh ? "原始单位" : "Reported unit"}
            <select value={unit} onChange={(e) => setUnit(e.target.value)}>
              {(endpoint === "inhibition"
                ? ["percent"]
                : endpoint === "reported_binding"
                  ? ["qualitative"]
                  : ["nM", "uM"]
              ).map((value) => (
                <option key={value}>{value}</option>
              ))}
            </select>
          </label>
        </div>
      )}
      {mode === "candidates" && (
        <>
          <ChoiceCards<"retain" | "cap_hydrogen">
            label={
              zh
                ? "DNA 连接位置如何处理？"
                : "How should the DNA attachment be handled?"
            }
            value={attachmentPolicy}
            onChange={setAttachmentPolicy}
            options={[
              {
                value: "retain",
                title: zh ? "保留原始结构" : "Retain supplied chemistry",
                note: zh
                  ? "含连接标记的成员需要先确认结构才能生成三维构象"
                  : "Review attachment markers before 3D generation",
              },
              {
                value: "cap_hydrogen",
                title: zh
                  ? "去除连接标记，以氢封端"
                  : "Cap terminal attachment with hydrogen",
                note: zh
                  ? "生成用于后续计算的衍生结构，原始结构仍保留"
                  : "Prepare a derived calculation structure; retain the original",
              },
            ]}
          />
          <SourcePicker
            role="definition"
            values={definitions}
            onChange={setDefinitions}
            language={language}
            label={
              zh
                ? "缺少结构时，可提供匹配的库定义"
                : "Matching definition, if chemical structures are unresolved"
            }
          />
        </>
      )}
      {["enumerate", "decode", "count", "series", "model"].includes(mode) && (
        <DELExpertSettings
          mode={mode}
          language={language}
          value={expert}
          onChange={setExpert}
        />
      )}
      <Hint label={zh ? "方法说明" : "Method help"}>
        {zh
          ? "富集来自测序计数，不是亲和力。研究模型使用独立砌块留出评估；缺少结构或对照时不会补造结果。"
          : "Enrichment derives from sequencing counts, not affinity. Research models use independent cycle holdout. Missing structures or references are never fabricated."}
      </Hint>
    </div>
  );
}
