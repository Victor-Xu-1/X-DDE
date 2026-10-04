import type { Language } from "../types";
import { Hint } from "../guided/Hint";
import type { AlertPolicy, ScreenOptions } from "./screen-types";

export function LibraryInspectionChoices({
  language,
  options,
  onChange,
}: {
  language: Language;
  options: ScreenOptions;
  onChange(change: Partial<ScreenOptions>): void;
}) {
  const zh = language === "zh";
  return (
    <>
      {options.mode === "scaffold" && (
        <label className="field">
          {zh ? "每个骨架保留几个？" : "Representatives per scaffold"}
          <select
            value={options.per_scaffold}
            onChange={(event) =>
              onChange({ per_scaffold: Number(event.target.value) })
            }
          >
            {![1, 2, 3, 5].includes(options.per_scaffold) && (
              <option value={options.per_scaffold}>
                {options.per_scaffold}
              </option>
            )}
            <option value={1}>{zh ? "1 个（推荐）" : "1 (recommended)"}</option>
            <option value={2}>2</option>
            <option value={3}>3</option>
            <option value={5}>5</option>
          </select>
        </label>
      )}
      <label
        className="field"
        title={
          zh
            ? "规则命中需要进一步核查，不能直接判定毒性或无活性。"
            : "Rule matches require review; they do not establish toxicity or inactivity."
        }
      >
        {zh ? "结构风险如何处理？" : "How should structural alerts be handled?"}
        <select
          value={options.alert_policy}
          onChange={(event) =>
            onChange({ alert_policy: event.target.value as AlertPolicy })
          }
        >
          {options.mode !== "alerts" && (
            <option value="off">
              {zh ? "这次不检查" : "Do not inspect this time"}
            </option>
          )}
          <option value="warn">
            {zh
              ? "检查并提示，保留候选（推荐）"
              : "Flag matches and keep candidates (recommended)"}
          </option>
          <option value="exclude">
            {zh
              ? "暂时排除命中规则的候选"
              : "Exclude rule-matched candidates for this selection"}
          </option>
        </select>
      </label>
      {options.mode === "scaffold" && (
        <Hint label={zh ? "怎样挑选代表？" : "How are representatives chosen?"}>
          {zh
            ? "先覆盖不同骨架，再取同组的第二个；组内按原始文件顺序，不按药效排序。无环分子按自身结构分组，含多个片段的记录保留但不参与此项选择。"
            : "Cover different scaffolds first, then select a second per family. Within families, use input order, not activity rank. Acyclic molecules retain their own identities; multi-fragment records remain in the report but are not selected by this method."}
        </Hint>
      )}
      {options.alert_policy !== "off" && (
        <Hint
          label={zh ? "这些提示意味着什么？" : "What do these alerts mean?"}
        >
          {zh
            ? "PAINS 提示可能干扰测定的结构模式，Brenk 提示需核查的结构片段。规则有适用范围；命中不是毒性结论，未命中也不证明安全。"
            : "PAINS flags structural patterns associated with assay interference; Brenk flags fragments for review. Rules have a limited scope: a match is not a toxicity conclusion and no matches do not prove safety."}
        </Hint>
      )}
    </>
  );
}
