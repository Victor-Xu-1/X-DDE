import { useMemo, useState } from "react";
import "./cluster.css";
import { api } from "../api";
import { Questionnaire } from "../guided/Questionnaire";
import { ChoiceCards } from "../guided/ChoiceCards";
import { Hint } from "../guided/Hint";
import { useTaskReadiness } from "../guided/useTaskReadiness";
import { useTaskSubmit } from "../operations/useTaskSubmit";
import type { Language } from "../types";
import type { PoseSet } from "./types";
import type {
  ClusterOptions,
  PoseClusterTask,
  PoseSelector,
} from "./cluster-types";
import { clusterDefaults } from "./cluster-generated";
export function ClusterForm({
  value,
  language,
}: {
  value: PoseSet;
  language: Language;
}) {
  const zh = language === "zh",
    availability = useTaskReadiness("pose.cluster");
  const run = useTaskSubmit(() => {});
  const [selected, setSelected] = useState<string[]>([]),
    [options, setOptions] = useState<ClusterOptions>(clusterDefaults),
    [name, setName] = useState(""),
    [preparing, setPreparing] = useState(false),
    [error, setError] = useState("");
  const poses = useMemo(
    () =>
      value.outcomes.flatMap((o) =>
        o.poses
          .filter((p) => p.reference)
          .map((p) => ({
            key: o.combination.step_id + ":" + p.evidence.record,
            selection: {
              step_id: o.combination.step_id,
              record: p.evidence.record,
            } as PoseSelector,
            label:
              (zh ? "受体 " : "Receptor ") +
              (o.combination.member_index + 1) +
              " · " +
              (zh ? "口袋 " : "Pocket ") +
              o.combination.pocket_rank +
              " · " +
              (zh ? "姿势 " : "Pose ") +
              (p.evidence.record + 1) +
              " · seed " +
              o.combination.seed,
          })),
      ),
    [value, zh],
  );
  const choices = poses.filter((p) => selected.includes(p.key));
  async function submit() {
    setPreparing(true);
    setError("");
    try {
      const request = await api.post<PoseClusterTask>(
        "/research/pose-ensembles/" + value.id + "/clustering-request",
        {
          name:
            name.trim() || (zh ? "结合模式分群" : "Binding mode clustering"),
          selections: choices.map((p) => p.selection),
          options,
        },
      );
      return await run.submit(request);
    } catch (e) {
      setError(String(e));
    } finally {
      setPreparing(false);
    }
  }
  return (
    <Questionnaire
      language={language}
      ready={availability.ready}
      busy={run.busy || preparing}
      error={error || run.error || availability.error}
      unavailable={
        zh
          ? "请先安装分子准备环境（RDKit）。"
          : "Install the molecular preparation environment (RDKit)."
      }
      submitLabel={zh ? "开始分群" : "Cluster selected poses"}
      onSubmit={submit}
      steps={[
        {
          title: zh ? "选择需要比较的姿势" : "Select poses",
          valid: selected.length >= 2 && selected.length <= 50,
          content: (
            <>
              <div
                role="group"
                aria-label={zh ? "后端模型" : "Backend method"}
                className="task-model-switch"
              >
                <span>{zh ? "后端模型" : "Backend"}</span>
                <button type="button" aria-pressed={true}>
                  RDKit <small>{zh ? "默认" : "Default"}</small>
                </button>
              </div>
              <p>
                {zh
                  ? "选择 2–50 个姿势；保留各自配套的已对齐受体。"
                  : "Select 2–50 poses with their paired aligned receptors."}
              </p>
              <div className="editor-toolbar">
                <button
                  type="button"
                  className="secondary-button"
                  disabled={poses.length > 50}
                  onClick={() => setSelected(poses.map((p) => p.key))}
                >
                  {zh ? "全选" : "Select all"}
                </button>
                <button
                  type="button"
                  className="secondary-button"
                  onClick={() => setSelected([])}
                >
                  {zh ? "清空选择" : "Clear"}
                </button>
                <span>
                  {selected.length} / {poses.length}
                </span>
              </div>
              <div className="cluster-pose-selection">
                {poses.map((p) => (
                  <label className="checkbox-field" key={p.key}>
                    <input
                      type="checkbox"
                      checked={selected.includes(p.key)}
                      disabled={
                        !selected.includes(p.key) && selected.length >= 50
                      }
                      onChange={(e) =>
                        setSelected((s) =>
                          e.target.checked
                            ? [...s, p.key]
                            : s.filter((k) => k !== p.key),
                        )
                      }
                    />
                    {p.label}
                  </label>
                ))}
              </div>
            </>
          ),
        },
        {
          title: zh ? "选择比较方式" : "Choose comparison",
          valid: true,
          content: (
            <ChoiceCards<ClusterOptions["criterion"]>
              label={
                zh ? "按什么区分结合模式？" : "How should modes be separated?"
              }
              value={options.criterion}
              onChange={(criterion) => setOptions((o) => ({ ...o, criterion }))}
              options={[
                {
                  value: "both",
                  title: zh
                    ? "姿势＋残基接触 · 推荐"
                    : "Pose + residue contacts · Recommended",
                  note: zh
                    ? "同时保留相似三维位置和相似接触。"
                    : "Require both similar 3D positions and similar contacts.",
                },
                {
                  value: "geometry",
                  title: zh ? "三维姿势" : "3D pose",
                  note: zh
                    ? "在受体坐标内比较，不移动配体去叠合。"
                    : "Compare in the receptor frame without fitting ligands.",
                },
                {
                  value: "contacts",
                  title: zh ? "对应残基接触" : "Mapped residue contacts",
                  note: zh
                    ? "比较接近哪些对应残基；不是相互作用能量。"
                    : "Compare nearby corresponding residues, not interaction energies.",
                },
              ]}
            />
          ),
        },
        {
          title: zh ? "确认分群尺度" : "Choose resolution",
          valid: true,
          content: (
            <>
              <ChoiceCards
                label={
                  zh
                    ? "希望分得多细？"
                    : "How finely should modes be separated?"
                }
                value={String(options.maximum_rmsd_angstrom)}
                onChange={(v) =>
                  setOptions((o) => ({
                    ...o,
                    maximum_rmsd_angstrom: Number(v),
                    minimum_contact_jaccard:
                      v === "1" ? 0.7 : v === "3" ? 0.3 : 0.5,
                  }))
                }
                options={[
                  {
                    value: "1",
                    title: zh ? "精细" : "Fine",
                    note: zh
                      ? "1 Å · 接触相似度 ≥70%"
                      : "1 Å · contact similarity ≥70%",
                  },
                  {
                    value: "2",
                    title: zh ? "标准 · 推荐" : "Standard · Recommended",
                    note: zh
                      ? "2 Å · 接触相似度 ≥50%"
                      : "2 Å · contact similarity ≥50%",
                  },
                  {
                    value: "3",
                    title: zh ? "较宽松" : "Broad",
                    note: zh
                      ? "3 Å · 接触相似度 ≥30%"
                      : "3 Å · contact similarity ≥30%",
                  },
                ]}
              />
              <Hint
                label={
                  zh ? "这些指标是什么意思？" : "What do these metrics mean?"
                }
              >
                {zh
                  ? "只比较相同完整化学图、手性和电荷状态。空接触、对应不足或原子映射预算不足会保留为未知。不同条件原始对接分数不参与合并。"
                  : "Only identical complete chemical graphs, stereo and charge states can merge. Missing contacts, insufficient mapping or mapping-budget exhaustion remain unknown. Native scores from different conditions are not combined."}
              </Hint>
              <details>
                <summary>{zh ? "专家微调" : "Expert settings"}</summary>
                <label className="field">
                  {zh ? "残基接触距离（Å）" : "Residue contact distance (Å)"}
                  <select
                    value={options.contact_cutoff_angstrom}
                    onChange={(e) =>
                      setOptions((o) => ({
                        ...o,
                        contact_cutoff_angstrom: Number(e.target.value),
                      }))
                    }
                  >
                    {[3.5, 4, 4.5, 5, 6].map((v) => (
                      <option key={v} value={v}>
                        {v} Å
                      </option>
                    ))}
                  </select>
                </label>
              </details>
            </>
          ),
        },
        {
          title: zh ? "确认递交" : "Confirm submission",
          valid: choices.length >= 2 && choices.length <= 50,
          content: (
            <>
              <label className="field">
                {zh ? "分析名称" : "Analysis name"}
                <input
                  value={name}
                  maxLength={80}
                  onChange={(e) => setName(e.target.value)}
                />
              </label>
              <p>
                {zh ? "已选择" : "Selected"} {choices.length}{" "}
                {zh ? "个原生姿势" : "native poses"} ·{" "}
                {zh
                  ? "代表姿势保留原始坐标，可预览和下载。"
                  : "Representatives retain original coordinates for preview and download."}
              </p>
            </>
          ),
        },
      ]}
    />
  );
}
