import { useState } from "react";
import { PoseScoreComparison } from "./PoseScoreComparison";
import { artifactUrl } from "../api";
import { StructureViewer } from "../viewer/StructureViewer";
import { PropertyForm } from "../operations/PropertyForm";
import { scoreLabel } from "../docking/scoreLabels";
import { DockingForm } from "../docking/DockingForm";
import type { Language } from "../types";
import type { PoseSet } from "./types";
export function PoseResults({
  value,
  language,
}: {
  value: PoseSet;
  language: Language;
}) {
  const zh = language === "zh";
  const [index, setIndex] = useState(0),
    [pose, setPose] = useState<number | null>(null),
    [next, setNext] = useState<"properties" | "score" | "minimize" | null>(
      null,
    ),
    [message, setMessage] = useState("");
  const outcome = value.outcomes[index],
    combination = outcome.combination;
  const selected = outcome.poses.find(
    (p) => p.evidence.record === pose && p.reference,
  );
  const labels: Record<string, string> = {
    succeeded: zh ? "有原生结果" : "Native result",
    failed: zh ? "失败" : "Failed",
    cancelled: zh ? "已取消" : "Cancelled",
    interrupted: zh ? "已中断" : "Interrupted",
    missing: zh ? "任务记录缺失" : "Task missing",
    not_attempted: zh ? "尚未尝试" : "Not attempted",
  };
  return (
    <section
      className="pose-results"
      aria-label={zh ? "多假设姿势集合" : "Multi-hypothesis pose ensemble"}
    >
      <p>
        {zh ? "可复用姿势" : "Reusable poses"}: {value.qualified_pose_count} ·{" "}
        {value.collection_status === "complete"
          ? zh
            ? "各组合均已执行"
            : "All combinations executed"
          : zh
            ? "部分组合结果"
            : "Partial combination results"}
      </p>
      <p className="field-help">
        {zh
          ? "保留成功、失败、取消及未尝试的组合。原生姿势与分数不是实验结合确证；不同受体、状态或方法的分数不能直接混排。"
          : "Successful, failed, cancelled and unattempted combinations are retained. Poses/scores are not experimental binding proof; do not rank scores across different receptors, states or methods indiscriminately."}
      </p>
      <label className="field">
        {zh ? "查看哪个组合？" : "Which combination?"}
        <select
          value={index}
          onChange={(e) => {
            setIndex(Number(e.target.value));
            setPose(null);
            setNext(null);
          }}
        >
          {value.outcomes.map((o, i) => (
            <option key={o.combination.step_id} value={i}>
              {zh ? "受体 " : "Receptor "}
              {o.combination.member_index + 1} · {zh ? "口袋 " : "Pocket "}
              {o.combination.pocket_rank} · {zh ? "分子 " : "Ligand "}
              {o.combination.ligand_index + 1} · seed {o.combination.seed} ·{" "}
              {labels[o.status]}
            </option>
          ))}
        </select>
      </label>
      {outcome.reason && <p role="status">{outcome.reason}</p>}
      {outcome.job_id && (
        <a href={"/#task=" + encodeURIComponent(outcome.job_id)}>
          {zh ? "查看此组合的原生任务" : "Open this native attempt"}
        </a>
      )}
      {outcome.initial_conformer_generated === true && (
        <p className="field-help">
          {zh
            ? "原生流程为此输入生成了初始三维构象。"
            : "The native procedure generated an initial three-dimensional conformer."}
        </p>
      )}
      {outcome.status === "succeeded" && !outcome.poses.length && (
        <p role="status">
          {zh
            ? "原生任务未返回姿势；不会填充虚拟候选。"
            : "The native task returned no poses; no synthetic candidates are filled in."}
        </p>
      )}
      <div
        className="pose-table"
        tabIndex={0}
        role="region"
        aria-label={zh ? "原生姿势表" : "Native pose table"}
      >
        <table>
          <thead>
            <tr>
              <th>{zh ? "姿势" : "Pose"}</th>
              <th>{zh ? "原生分数与单位" : "Native score and units"}</th>
              <th>{zh ? "状态" : "Status"}</th>
            </tr>
          </thead>
          <tbody>
            {outcome.poses.map((p) => (
              <tr key={p.evidence.record}>
                <th>
                  <button
                    className="secondary-button"
                    type="button"
                    disabled={!p.reference}
                    aria-pressed={pose === p.evidence.record}
                    onClick={() => {
                      setPose(p.evidence.record);
                      setNext(null);
                    }}
                  >
                    {zh ? "姿势 " : "Pose "}
                    {p.evidence.record + 1}
                  </button>
                </th>
                <td>
                  {p.evidence.scores.map((s) => (
                    <span
                      key={s.name}
                      title={
                        zh
                          ? "原生方法分数，不换算为 KD 或 IC50"
                          : "Native score; not converted to KD or IC50"
                      }
                    >
                      {scoreLabel(s.name, language)}: {s.value.toFixed(3)}{" "}
                      {s.unit}{" "}
                    </span>
                  ))}
                </td>
                <td>
                  {p.reference
                    ? zh
                      ? "通过当前原生检查"
                      : "Passed current native checks"
                    : (p.evidence.reason ?? (zh ? "未通过" : "Rejected"))}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <PoseScoreComparison
        value={value}
        outcomeIndex={index}
        language={language}
        onSelect={(stepId, record) => {
          const target = value.outcomes.findIndex(
            (o) => o.combination.step_id === stepId,
          );
          if (target >= 0) {
            setIndex(target);
            setPose(record);
            setNext(null);
          }
        }}
      />
      {selected?.reference && (
        <>
          <StructureViewer
            urls={[
              "/api/assets/" + combination.receptor.asset_id,
              "/api/assets/" + selected.reference.asset_id,
            ]}
            language={language}
          />
          <div className="editor-toolbar">
            <a href={"/api/assets/" + selected.reference.asset_id} download>
              {zh ? "下载此姿势" : "Download this pose"}
            </a>
            <button
              className="secondary-button"
              type="button"
              onClick={() => setNext("properties")}
            >
              {zh ? "计算此姿势分子性质" : "Calculate molecular properties"}
            </button>
            <button
              className="secondary-button"
              type="button"
              onClick={() => setNext("score")}
            >
              {zh ? "在配套受体上重新评分" : "Rescore with paired receptor"}
            </button>
            <button
              className="secondary-button"
              type="button"
              onClick={() => setNext("minimize")}
            >
              {zh ? "在配套受体上局部最小化" : "Minimize with paired receptor"}
            </button>
          </div>
          {next === "properties" && (
            <PropertyForm
              key={selected.reference.version_id + next}
              language={language}
              initialFile={selected.reference.asset_id}
              scientificInput={selected.reference}
              onCreated={(j) => setMessage(j.id)}
            />
          )}
          {(next === "score" || next === "minimize") && (
            <DockingForm
              key={selected.reference.version_id + next}
              language={language}
              mode={next}
              initialReceptor={combination.receptor}
              initialLigand={selected.reference}
              onCreated={(j) => setMessage(j.id)}
            />
          )}
        </>
      )}

      {message && <p role="status">{message}</p>}
    </section>
  );
}
