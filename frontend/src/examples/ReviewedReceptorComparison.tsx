import { useRef } from "react";
import type { Language } from "../types";
import type { ExampleInfo } from "./types";
import { matchesReviewedSources } from "./reviewed-sources";
import data from "./reviewed-receptor-data.json";
import "./reviewed-receptor.css";

export function hasReviewedReceptorComparison(
  info: ExampleInfo | null,
  jobId: string,
) {
  return matchesReviewedSources(info, jobId, {
    ...data,
    supporting: data.supporting.map((stage) => ({
      job_id: stage.job_id,
      artifact_sha256: stage.artifacts,
    })),
  });
}

export function reviewedReceptorFinding(language: Language) {
  return language === "zh"
    ? `候选 ${data.candidate_number} 的对接排名随受体结构改变；几何质控不等于结合模式或亲和力验证。`
    : `Candidate ${data.candidate_number}'s docking ranking depends on receptor structure. Geometry checks do not validate binding mode or affinity.`;
}

export function ReviewedReceptorComparison({
  language,
  onStage,
}: {
  language: Language;
  onStage(jobId: string): void;
}) {
  const zh = language === "zh";
  const panel = useRef<HTMLDetailsElement>(null);
  const label = (receptor: string) =>
    receptor === "predicted"
      ? zh
        ? "预测域模型"
        : "Predicted domain"
      : zh
        ? "9BIG 实验构建体"
        : "9BIG experimental construct";
  function show(jobId: string) {
    onStage(jobId);
    if (panel.current) panel.current.open = false;
  }
  const csv = [
    "receptor,pose,empirical_score_kcal_mol,measured_pass,unassessed,not_applicable,nearest_protein_angstrom",
    ...data.poses.map((pose) =>
      [
        pose.receptor,
        pose.rank,
        pose.score_kcal_mol,
        pose.quality.pass,
        pose.quality.unassessed,
        pose.quality.not_applicable,
        pose.nearest_protein_angstrom,
      ].join(","),
    ),
  ].join("\r\n");
  return (
    <details className="reviewed-receptor" ref={panel}>
      <summary>
        {zh
          ? `候选 ${data.candidate_number} · 受体对照与姿势质控`
          : `Candidate ${data.candidate_number} · receptor controls and pose quality`}
      </summary>
      <p>
        {zh
          ? `以下仅比较生成候选 ${data.candidate_number} 的后续研究。同一准备分子在两个受体中各搜索了 ${data.method.poses_per_receptor} 个姿势。预测域模型为 STAT6 436–658；实验构建体包含未解析区域。`
          : `This compares follow-up studies of generated candidate ${data.candidate_number} only. The same prepared molecule was searched for ${data.method.poses_per_receptor} poses in each receptor. The predicted STAT6 model covers residues 436–658; the experimental construct has unresolved regions.`}
      </p>
      <p className="field-help">{data.method.scoring}</p>
      <div className="reviewed-receptor-finding">
        <span>
          {zh ? "预测受体前两姿势" : "Top two predicted-receptor poses"}
        </span>
        <strong>
          {data.comparison.predicted_top_pair_rmsd_angstrom.toFixed(2)} Å
        </strong>
        <span>
          {zh ? "分数仅差" : "score gap"}{" "}
          {Math.abs(
            data.poses[0].score_kcal_mol - data.poses[1].score_kcal_mol,
          ).toFixed(5)}{" "}
          kcal/mol
        </span>
        <span>{zh ? "两受体首位姿势" : "Top poses across receptors"}</span>
        <strong>
          {data.comparison.top_pose_rmsd_between_receptors_angstrom.toFixed(2)}{" "}
          Å
        </strong>
      </div>
      <div className="reviewed-receptor-table">
        <table
          aria-label={zh ? "受体与姿势对照" : "Receptor and pose comparison"}
        >
          <thead>
            <tr>
              <th scope="col">{zh ? "受体 · 排名" : "Receptor · rank"}</th>
              <th scope="col">{zh ? "评分 · kcal/mol" : "Score · kcal/mol"}</th>
              <th scope="col">
                {zh ? "独立几何质控" : "Independent geometry checks"}
              </th>
              <th scope="col">{zh ? "结构与详情" : "Structure and details"}</th>
            </tr>
          </thead>
          <tbody>
            {data.poses.map((pose) => (
              <tr key={pose.quality_job}>
                <th scope="row">
                  {label(pose.receptor)} · {pose.rank}
                </th>
                <td>{pose.score_kcal_mol.toFixed(5)}</td>
                <td>
                  {zh
                    ? `${pose.quality.pass} 已测通过 · ${pose.quality.unassessed} 未评估 · ${pose.quality.not_applicable} 不适用`
                    : `${pose.quality.pass} measured passes · ${pose.quality.unassessed} unassessed · ${pose.quality.not_applicable} not applicable`}
                </td>
                <td>
                  <button
                    type="button"
                    className="text-button"
                    aria-label={
                      zh
                        ? `查看${label(pose.receptor)}姿势 ${pose.rank} 的质控`
                        : `Inspect ${label(pose.receptor)} pose ${pose.rank} quality`
                    }
                    onClick={() => show(pose.quality_job)}
                  >
                    {zh ? "查看结构与质控" : "Inspect structure and quality"}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="reviewed-receptor-actions">
        {[data.poses[0], data.poses[2]].map((pose) => (
          <button
            key={pose.docking_job}
            type="button"
            className="secondary-button"
            onClick={() => show(pose.docking_job)}
          >
            {zh
              ? `查看${label(pose.receptor)}的全部姿势`
              : `All ${label(pose.receptor)} poses`}
          </button>
        ))}
        <a
          download="stat6-receptor-pose-comparison.csv"
          href={`data:text/csv;charset=utf-8,${encodeURIComponent("\ufeff" + csv)}`}
        >
          {zh ? "下载对照表" : "Download comparison"}
        </a>
      </div>
      <p className="field-help">
        {zh
          ? `RMSD 比较同一化学结构的重原子，未重新叠合配体，也未改变坐标。两受体有 ${data.method.matched_ca_atoms} 个同编号同残基的 Cα 位点，未拟合 RMSD 为 ${data.method.no_fit_ca_rmsd_angstrom.toFixed(2)} Å。6 项未评估检查对应缺失的水与辅因子环境。`
          : `RMSD compares heavy atoms of the same chemical structure without fitting the ligands or changing coordinates. The receptors share ${data.method.matched_ca_atoms} Cα positions with matched residue identities and numbers; their no-fit RMSD is ${data.method.no_fit_ca_rmsd_angstrom.toFixed(2)} Å. Six checks lack water/cofactor context.`}
      </p>
    </details>
  );
}
