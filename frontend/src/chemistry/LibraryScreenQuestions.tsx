import { ChoiceCards } from "../guided/ChoiceCards";
import { Hint } from "../guided/Hint";
import { ReferencePicker } from "../diffsbdd/ReferencePicker";
import type { Language } from "../types";
import type { MoleculeRef } from "../research/types";
import { useContext, useLayoutEffect, useRef, useState } from "react";
import { TaskPresentationContext } from "../guided/TaskPresentation";
import type { UtilityDrawingOffer } from "../utilities/UtilityDrawingContext";
import {
  UtilityImageInput,
  type UtilityImageValue,
} from "../utilities/UtilityImageInput";
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
  drawing,
}: {
  language: Language;
  mode: ScreenMode;
  onMode(mode: ScreenMode): void;
  query: MoleculeRef | null;
  onQuery(query: MoleculeRef | null): void;
  drawing?: UtilityDrawingOffer | null;
}) {
  const zh = language === "zh",
    requiresQuery = mode === "similarity" || mode === "substructure";
  const presentation = useContext(TaskPresentationContext);
  const [querySession, setQuerySession] = useState(0);
  const [imageInput, setImageInput] = useState<UtilityImageValue | null>(null);
  const purposeField = useRef<HTMLSelectElement>(null);
  const restorePurposeFocus = useRef(false);
  useLayoutEffect(() => {
    if (!restorePurposeFocus.current) return;
    restorePurposeFocus.current = false;
    purposeField.current?.focus({ preventScroll: true });
  }, [querySession]);
  const purposeLabel = zh
    ? "这次希望找什么？"
    : "What should this selection do?";
  const purposes = Object.entries(screenLabels).map(([value, label]) => ({
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
  }));
  const queryInput = (
    <ReferencePicker
      kind="ligand"
      allowedSuffixes={[".sdf"]}
      value={query}
      onChange={onQuery}
      language={language}
      label={zh ? "参照分子或片段" : "Query molecule or fragment"}
      uploadKey={imageInput?.key}
    />
  );
  const purpose =
    presentation?.layout === "single" ? (
      <label className="field">
        {purposeLabel}
        <select
          ref={purposeField}
          value={mode}
          onChange={(event) => {
            const selected = purposes.find(
              (option) => option.value === event.target.value,
            );
            if (selected) {
              restorePurposeFocus.current =
                document.activeElement === event.currentTarget;
              setImageInput(null);
              setQuerySession((key) => key + 1);
              onMode(selected.value);
            }
          }}
        >
          {purposes.map((option) => (
            <option key={option.value} value={option.value} title={option.hint}>
              {option.title}
            </option>
          ))}
        </select>
      </label>
    ) : (
      <ChoiceCards<ScreenMode>
        label={purposeLabel}
        value={mode}
        onChange={onMode}
        options={purposes}
      />
    );

  const fields = (
    <>
      {purpose}
      {requiresQuery && queryInput}
    </>
  );
  const shortcutLabel = zh
    ? "粘贴截图查相似"
    : "Paste screenshot to find similar";
  return (
    <>
      {presentation?.imageEntry === "workspace" ? (
        <UtilityImageInput
          key={querySession}
          target="query"
          language={language}
          active={presentation.active !== false}
          drawing={drawing}
          value={query?.asset_id ?? ""}
          pasteLabel={requiresQuery ? undefined : shortcutLabel}
          onLoaded={(value) => {
            setImageInput(value);
            onQuery(value.reference);
          }}
        >
          {fields}
        </UtilityImageInput>
      ) : (
        fields
      )}
      {presentation?.layout !== "single" && (
        <Hint label={zh ? "选择的依据是什么？" : "What is selection based on?"}>
          {zh
            ? "按已有化学结构筛选；风险规则和骨架选择可在设置中调整。相似性使用保留手性的 Morgan 指纹。这些方法不预测药效或结合。"
            : "Select by existing chemical structures; adjust rule alerts and scaffold limits in settings. Similarity uses chiral Morgan fingerprints. These methods do not predict activity or binding."}
        </Hint>
      )}
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
            <dt>{zh ? "参照分子记录" : "Query record"}</dt>
            <dd>
              {zh
                ? `第 ${query.record + 1} 条记录`
                : `Record ${query.record + 1}`}
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
