import { searchReviewNotice } from "./searchNotice";
import type { ReactNode } from "react";
import type { Language } from "../types";
import { ReviewReference } from "../diffsbdd/ReviewReference";
import type { DockingTask } from "./types";

/** Render the effective request, never a second set of review defaults. */
export function DockingReview({
  getTask,
  enabled,
  language,
}: {
  getTask(): DockingTask;
  enabled: boolean;
  language: Language;
}) {
  const zh = language === "zh";
  if (!enabled) return null;
  const request = getTask();
  const options = request.options;
  const search = request.search;
  const operations = {
    dock: zh ? "探索结合模式" : "Explore binding poses",
    score: zh
      ? "评估已有姿势 · 不移动坐标"
      : "Score existing pose · coordinates unchanged",
    minimize: zh
      ? "局部优化 · 保留初始姿势"
      : "Local optimization · original pose retained",
  };
  const neural: Record<string, string> = zh
    ? {
        none: "关闭",
        rescore: "候选重新评分",
        refinement: "局部精修",
        all: "全程参与",
      }
    : {
        none: "Off",
        rescore: "Rescore candidates",
        refinement: "Local refinement",
        all: "Full search",
      };
  const rows: [string, ReactNode][] = [
    [zh ? "任务" : "Task", request.name],
    [zh ? "计算内容" : "Operation", operations[request.mode]],
    [
      zh ? "受体" : "Receptor",
      <ReviewReference
        reference={request.receptor}
        kind="structure"
        language={language}
      />,
    ],
    [
      zh ? "研究分子" : "Study molecule",
      <ReviewReference
        reference={request.ligand}
        kind="ligand"
        language={language}
      />,
    ],
  ];
  if (search?.kind === "reference_ligand") {
    rows.push(
      [
        zh ? "口袋参考配体" : "Pocket reference",
        <ReviewReference
          reference={search.reference}
          kind="ligand"
          language={language}
        />,
      ],
      [
        zh ? "搜索范围" : "Search region",
        `${zh ? "参考配体周围留白" : "Reference-ligand margin"} ${options.autobox_add} Å`,
      ],
    );
  } else if (search?.kind === "box") {
    rows.push(
      [zh ? "搜索中心" : "Search center", `${search.box.center.join(" / ")} Å`],
      [
        zh ? "搜索边长" : "Search dimensions",
        `${search.box.size.join(" × ")} Å`,
      ],
    );
  } else {
    rows.push([
      zh ? "坐标系" : "Coordinate frame",
      zh ? "已确认与所选受体一致" : "Confirmed to match the selected receptor",
    ]);
  }
  rows.push(
    [
      zh ? "经验评分" : "Empirical scoring",
      String(options.scoring).toUpperCase(),
    ],
    [zh ? "神经网络" : "Neural scoring", neural[String(options.cnn_scoring)]],
    [
      zh ? "计算设备" : "Compute device",
      `${options.use_gpu ? "GPU + " : ""}CPU × ${options.cpu}`,
    ],
  );
  if (request.mode === "dock") {
    rows.push([
      zh ? "搜索与输出" : "Search and output",
      zh
        ? `搜索强度 ${options.exhaustiveness} · 最多 ${options.num_modes} 个姿势`
        : `Exhaustiveness ${options.exhaustiveness} · at most ${options.num_modes} poses`,
    ]);
  } else if (request.mode === "minimize") {
    rows.push([
      zh ? "局部优化上限" : "Local optimization limit",
      options.minimize_iters === 0
        ? zh
          ? "原生默认"
          : "Native default"
        : String(options.minimize_iters),
    ]);
    rows.push([
      zh ? "蛋白处理" : "Receptor treatment",
      request.flexible_receptor
        ? request.flexible_receptor.residues
            .map((r) => `${r.chain}:${r.number}${r.insertion_code}`)
            .join(", ")
        : zh
          ? "固定蛋白"
          : "Fixed receptor",
    ]);
  }
  return (
    <section aria-label={zh ? "对接方案核对" : "Docking plan review"}>
      {request.mode === "dock" && (
        <p className="field-help">{searchReviewNotice(language)}</p>
      )}
      <table
        className="compact-table"
        aria-label={zh ? "材料与计算方案" : "Materials and calculation plan"}
      >
        <tbody>
          {rows.map(([label, value]) => (
            <tr key={label}>
              <th scope="row">{label}</th>
              <td>{value}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <details>
        <summary>
          {zh ? "计算预算与重复条件" : "Budget and reproducibility"}
        </summary>
        <dl className="questionnaire-review">
          <dt>{zh ? "内存上限" : "Memory limit"}</dt>
          <dd>{String(options.memory_mib)} MiB</dd>
          <dt>{zh ? "时间上限" : "Time limit"}</dt>
          <dd>{String(options.time_limit_seconds)} s</dd>
          <dt>{zh ? "随机种子" : "Random seed"}</dt>
          <dd>{String(options.seed)}</dd>
          {options.use_gpu === true && (
            <>
              <dt>GPU</dt>
              <dd>{String(options.gpu_device)}</dd>
            </>
          )}
        </dl>
      </details>
    </section>
  );
}
