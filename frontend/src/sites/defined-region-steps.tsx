import type { Dispatch, SetStateAction } from "react";
import type { QuestionStep } from "../guided/Questionnaire";
import { ReviewReference } from "../diffsbdd/ReviewReference";
import type { ReceptorSet } from "../receptors/types";
import type { Language } from "../types";
import { DefinedRegionEditor } from "./DefinedRegionEditor";
import { DefinedRegionReview } from "./DefinedRegionReview";
import type { RegionDraft } from "./region-draft";
import type { DefinedRegion } from "./types";

export function definedRegionSteps({
  members,
  drafts,
  selected,
  regions,
  detailsValid,
  confirmed,
  distinct,
  name,
  language,
  append,
  change,
  setDrafts,
  setName,
}: {
  members: ReceptorSet["members"];
  drafts: RegionDraft[];
  selected: RegionDraft | undefined;
  regions: DefinedRegion[];
  detailsValid: boolean;
  confirmed: boolean;
  distinct: boolean;
  name: string;
  language: Language;
  append(member: number): void;
  change(delta: Partial<RegionDraft>): void;
  setDrafts: Dispatch<SetStateAction<RegionDraft[]>>;
  setName: Dispatch<SetStateAction<string>>;
}): readonly [QuestionStep, QuestionStep, QuestionStep, QuestionStep] {
  const zh = language === "zh";
  return [
    {
      title: zh ? "选择受体" : "Choose receptors",
      valid: drafts.length > 0,
      content: (
        <div role="group" aria-label={zh ? "对齐受体" : "Aligned receptors"}>
          {!members.length && (
            <p role="status">
              {zh
                ? "请先完成受体对齐，至少保留一个可用受体。"
                : "First align receptors and retain at least one qualified member."}
            </p>
          )}
          {members.map((m) => (
            <label className="checkbox-label" key={m.evidence.index}>
              <input
                type="checkbox"
                disabled={
                  drafts.length >= 12 &&
                  !drafts.some((row) => row.member === m.evidence.index)
                }
                checked={drafts.some((row) => row.member === m.evidence.index)}
                onChange={(e) => {
                  if (e.target.checked) append(m.evidence.index);
                  else
                    setDrafts((rows) =>
                      rows.filter((row) => row.member !== m.evidence.index),
                    );
                }}
              />
              {zh ? "受体" : "Receptor"} {m.evidence.index + 1}
              <ReviewReference
                reference={m.reference!}
                kind="structure"
                language={language}
              />
            </label>
          ))}
        </div>
      ),
    },
    {
      title: zh ? "定义区域" : "Define regions",
      valid: detailsValid,
      content: selected ? (
        <>
          <DefinedRegionEditor
            key={selected.key}
            value={selected}
            onChange={change}
            language={language}
          />
          <div className="receptor-actions">
            <button
              type="button"
              className="secondary-button"
              disabled={drafts.length >= 12}
              onClick={() => append(selected.member)}
            >
              {zh ? "为此受体添加区域" : "Add region for this receptor"}
            </button>
            <button
              type="button"
              className="text-button"
              disabled={drafts.length <= 1}
              onClick={() =>
                setDrafts((rows) =>
                  rows.filter((row) => row.key !== selected.key),
                )
              }
            >
              {zh ? "移除此区域" : "Remove this region"}
            </button>
          </div>
        </>
      ) : (
        <p>{zh ? "返回上一步选择受体。" : "Go back and select a receptor."}</p>
      ),
    },
    {
      title: zh ? "核对坐标" : "Check coordinates",
      valid: confirmed && distinct,
      content: (
        <>
          {selected?.kind === "reference" && (
            <label className="checkbox-label">
              <input
                type="checkbox"
                checked={selected.confirmed}
                onChange={(e) => change({ confirmed: e.target.checked })}
              />
              {zh
                ? "确认此参考配体处于当前对齐受体的坐标系中。"
                : "This reference ligand uses the currently aligned receptor's coordinate frame."}
            </label>
          )}
          {drafts.map((row) => (
            <p key={row.key}>
              {row.label} ·{" "}
              {row.kind === "box"
                ? zh
                  ? "手动坐标范围"
                  : "Manual coordinate bounds"
                : row.confirmed
                  ? zh
                    ? "坐标系已确认"
                    : "Frame confirmed"
                  : zh
                    ? "待核对坐标系"
                    : "Frame confirmation needed"}
            </p>
          ))}
          {!distinct && (
            <p role="alert">
              {zh
                ? "同一受体的搜索条件重复，请修改或移除重复区域。"
                : "Repeated conditions for one receptor: edit or remove the duplicate region."}
            </p>
          )}
        </>
      ),
    },
    {
      title: zh ? "确认保存" : "Review and save",
      valid: confirmed && distinct,
      content: (
        <>
          <label className="field">
            {zh ? "研究名称（可选）" : "Study name (optional)"}
            <input
              maxLength={120}
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </label>
          <DefinedRegionReview regions={regions} language={language} />
          <p className="field-help">
            {zh
              ? "保存搜索条件，不生成口袋分数，也不启动计算。"
              : "Save search conditions; no pocket scores are invented and no calculation starts."}
          </p>
        </>
      ),
    },
  ];
}
