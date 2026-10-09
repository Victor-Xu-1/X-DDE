import type { Dispatch, SetStateAction } from "react";
import type { Language } from "../types";
import { ChoiceCards } from "../guided/ChoiceCards";
import { ShortlistChoices, type ShortlistSettings } from "./ShortlistChoices";
export interface ScreeningReviewProps {
  language: Language;
  profile: "quick" | "focused" | "broad";
  setProfile: Dispatch<SetStateAction<"quick" | "focused" | "broad">>;
  preset: { topK: number; retain: number; dock: boolean };
  name: string;
  setName: Dispatch<SetStateAction<string>>;
  shortlist: ShortlistSettings;
  setShortlist: Dispatch<SetStateAction<ShortlistSettings>>;
  score: "fold_zscore" | "mean_cosine";
  setScore: Dispatch<SetStateAction<"fold_zscore" | "mean_cosine">>;
  altloc: "highest_occupancy" | "reject" | "A" | "B";
  setAltloc: Dispatch<
    SetStateAction<"highest_occupancy" | "reject" | "A" | "B">
  >;
  device: "cpu" | "cuda";
  setDevice: Dispatch<SetStateAction<"cpu" | "cuda">>;
  radius: number;
  setRadius: Dispatch<SetStateAction<number>>;
  batch: number;
  setBatch: Dispatch<SetStateAction<number>>;
}
export function ScreeningReview({
  language,
  profile,
  setProfile,
  preset,
  name,
  setName,
  shortlist,
  setShortlist,
  score,
  setScore,
  altloc,
  setAltloc,
  device,
  setDevice,
  radius,
  setRadius,
  batch,
  setBatch,
}: ScreeningReviewProps) {
  const zh = language === "zh";
  return (
    <div className="dataset-question-content">
      <ChoiceCards<"quick" | "focused" | "broad">
        label={zh ? "筛选方案" : "Screening plan"}
        value={profile}
        onChange={setProfile}
        options={[
          {
            value: "quick",
            title: zh ? "快速探索" : "Quick exploration",
            note: zh
              ? "返回 100 个候选，保留 25 个三维构象"
              : "100 ranked candidates, 25 retained 3D conformers",
          },
          {
            value: "focused",
            title: zh ? "筛选＋重点对接" : "Screen and dock",
            note: zh
              ? "返回 300 个候选，对接前 40 个"
              : "300 candidates, dock 40 shortlisted molecules",
          },
          {
            value: "broad",
            title: zh ? "更广泛探索" : "Broader exploration",
            note: zh
              ? "返回 1,000 个候选，对接前 100 个"
              : "1,000 candidates, dock 100 shortlisted molecules",
          },
        ]}
      />
      <div className="dataset-review-strip">
        <div>
          <span>{zh ? "检索候选" : "Ranked"}</span>
          <strong>{preset.topK}</strong>
        </div>
        <div>
          <span>{zh ? "三维候选" : "3D retained"}</span>
          <strong>{preset.retain}</strong>
        </div>
        <div>
          <span>{zh ? "后续对接" : "Docking"}</span>
          <strong>
            {preset.dock
              ? zh
                ? "自动执行"
                : "Automatic"
              : zh
                ? "按需选择"
                : "Optional later"}
          </strong>
        </div>
      </div>
      <ShortlistChoices
        value={shortlist}
        onChange={setShortlist}
        language={language}
      />
      <label className="field">
        {zh ? "任务名称（可选）" : "Task name (optional)"}
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          maxLength={60}
          placeholder={
            zh ? "例如：靶点口袋先导筛选" : "e.g. Target lead screening"
          }
        />
      </label>
      <details className="dataset-expert">
        <summary>{zh ? "专家微调" : "Expert settings"}</summary>
        <div className="dataset-field-grid">
          <label className="field">
            {zh ? "检索评分方法" : "Retrieval scoring"}
            <select
              value={score}
              onChange={(e) => setScore(e.target.value as typeof score)}
            >
              <option value="fold_zscore">
                {zh
                  ? "六折标准化分数 · 大库推荐"
                  : "Six-fold normalized score · large libraries"}
              </option>
              <option value="mean_cosine">
                {zh
                  ? "六折平均相似度 · 小库可用"
                  : "Mean six-fold similarity · supports small libraries"}
              </option>
            </select>
          </label>
          <label className="field">
            {zh ? "蛋白的替代构象" : "Alternate protein conformers"}
            <select
              value={altloc}
              onChange={(e) => setAltloc(e.target.value as typeof altloc)}
            >
              <option value="highest_occupancy">
                {zh ? "选择占有率最高的主构象" : "Highest-occupancy conformer"}
              </option>
              <option value="reject">
                {zh
                  ? "遇到多构象时先人工确认"
                  : "Require prior manual preparation"}
              </option>
              <option value="A">A</option>
              <option value="B">B</option>
            </select>
          </label>
          <label className="field">
            {zh ? "计算设备" : "Compute device"}
            <select
              value={device}
              onChange={(e) => setDevice(e.target.value as "cpu" | "cuda")}
            >
              <option value="cpu">CPU</option>
              <option value="cuda">GPU · CUDA</option>
            </select>
          </label>
          <label className="field">
            {zh ? "口袋范围（Å）" : "Pocket radius (Å)"}
            <select
              value={radius}
              onChange={(e) => setRadius(Number(e.target.value))}
            >
              {[4, 5, 6, 8, 10].map((value) => (
                <option key={value}>{value}</option>
              ))}
            </select>
          </label>
          <label className="field">
            {zh ? "每批最多编码分子" : "Maximum molecules per batch"}
            <select
              value={batch}
              onChange={(e) => setBatch(Number(e.target.value))}
            >
              {[1, 4, 16, 32, 64].map((value) => (
                <option key={value}>{value}</option>
              ))}
            </select>
          </label>
        </div>
      </details>
      <p className="dataset-license-note">
        {zh
          ? "筛选模型与输出仅用于非商业科研。检索分数不代表亲和力。"
          : "Screening models and outputs are for noncommercial research. Retrieval scores are not affinity."}
      </p>
    </div>
  );
}
