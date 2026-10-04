import { ChoiceCards } from "../guided/ChoiceCards";
import { Hint } from "../guided/Hint";
import { ReferencePicker } from "../diffsbdd/ReferencePicker";
import type { Language } from "../types";
import type { MoleculeRef } from "../research/types";
import {
  screenLabels,
  type ScreenMode,
  type ScreenOptions,
} from "./screen-types";

export function ScreenPurpose({
  language,
  mode,
  onMode,
  query,
  onQuery,
}: {
  language: Language;
  mode: ScreenMode;
  onMode(mode: ScreenMode): void;
  query: MoleculeRef | null;
  onQuery(query: MoleculeRef | null): void;
}) {
  const zh = language === "zh",
    requiresQuery = mode === "similarity" || mode === "substructure";
  return (
    <>
      <ChoiceCards<ScreenMode>
        label={zh ? "这次希望找什么？" : "What should this selection do?"}
        value={mode}
        onChange={onMode}
        options={Object.entries(screenLabels).map(([value, label]) => ({
          value: value as ScreenMode,
          title: label[zh ? 0 : 1],
          hint:
            value === "alerts"
              ? zh
                ? "用 PAINS/Brenk 规则标记需要核查的结构，默认保留候选。"
                : "Flag structural patterns with PAINS/Brenk rules; candidates are kept by default."
              : value === "scaffold"
                ? zh
                  ? "先覆盖不同骨架，再挑同组代表，避免选择全是近似结构。"
                  : "Cover different scaffolds before another representative from the same family."
                : undefined,
        }))}
      />
      {requiresQuery && (
        <ReferencePicker
          kind="ligand"
          allowedSuffixes={[".sdf"]}
          value={query}
          onChange={onQuery}
          language={language}
          label={zh ? "参照分子或片段" : "Query molecule or fragment"}
        />
      )}
      <Hint label={zh ? "选择的依据是什么？" : "What is selection based on?"}>
        {zh
          ? "按已有化学结构筛选；风险规则和骨架选择在下一步设置。相似性使用保留手性的 Morgan 指纹。这些方法不预测药效或结合。"
          : "Select by existing chemical structures; set rule alerts and scaffold limits next. Similarity uses chiral Morgan fingerprints. These methods do not predict activity or binding."}
      </Hint>
    </>
  );
}

export function ScreenReview({
  language,
  libraryName,
  query,
  options,
}: {
  language: Language;
  libraryName: string;
  query: MoleculeRef | null;
  options: ScreenOptions;
}) {
  const zh = language === "zh";
  return (
    <>
      <dl className="questionnaire-review">
        <dt>{zh ? "分子库" : "Library"}</dt>
        <dd>{libraryName}</dd>
        <dt>{zh ? "用途" : "Purpose"}</dt>
        <dd>{screenLabels[options.mode][zh ? 0 : 1]}</dd>
        <dt>{zh ? "最多保留" : "Maximum output"}</dt>
        <dd>{options.max_selected}</dd>
        <dt>{zh ? "风险检查" : "Structural alerts"}</dt>
        <dd>
          {options.alert_policy === "off"
            ? zh
              ? "这次不检查"
              : "Not inspected"
            : options.alert_policy === "warn"
              ? zh
                ? "提示后保留候选"
                : "Flag and keep candidates"
              : zh
                ? "暂时排除规则命中"
                : "Exclude rule matches for this selection"}
        </dd>
        {options.mode === "scaffold" && (
          <>
            <dt>{zh ? "每个骨架" : "Per scaffold"}</dt>
            <dd>{options.per_scaffold}</dd>
          </>
        )}
        {query && (
          <>
            <dt>{zh ? "参照版本" : "Query version"}</dt>
            <dd>
              {query.version_id ?? query.asset_id} · #{query.record + 1}
            </dd>
          </>
        )}
      </dl>
      <Hint label={zh ? "结果如何复用？" : "How to reuse selected molecules?"}>
        {zh
          ? "选中记录保存为新分子资产，可继续准备构象、计算性质或对接。不会脱盐、枚举状态或推断坐标；盐和多片段会标记。未选中不等于无活性。"
          : "Selected records become new molecular assets for conformer preparation, properties or docking. No salt stripping, state enumeration or coordinate inference; salts/multiple fragments are flagged. Unselected does not mean inactive."}
      </Hint>
    </>
  );
}
