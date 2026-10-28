import type { Language } from "../types";
import type { ExampleInfo } from "./types";

/** Brief human-readable conclusions for exact, independently reviewed case outputs.
 * Do not apply a conclusion to a later revision or to a different result file.
 * The full source, interpretation and limitations remain in the immutable review.
 */
const highlights = [
  {
    capability: "p2rank.detect",
    revision: 3,
    job: "256b08a8-b466-47c4-a69e-32ad1d3bc9d9",
    result: "6d1683d952f64163c752a6d5d729e7179df86e66b82a8d5b1a6b0d61c3fa8362",
    text: [
      "这 5 个预测口袋未覆盖参考配体 5 Å 内的 17 个接触残基；已知位点研究应以实验参考区域为对照。",
      "None of these five predicted pockets overlaps the 17 residues within 5 Å of the reference ligand. Use the experimental region as a control when studying the known site.",
    ],
  },
  {
    capability: "gnina.dock",
    revision: 4,
    job: "5d2c6867-0563-488a-bda0-9f063458f0d8",
    result: "6e76b62358ee81d48caf78b155d10a3e720994b0ebf9002d9db5dcb06a2da38f",
    text: [
      "本结果是 R-group001 类似物的对接，并非指定小分子或 PROTAC 的结合姿势；评分不是实测亲和力。",
      "This result docks the R-group001 analogue, not the specified small molecule or PROTAC. The score is not measured affinity.",
    ],
  },
  {
    capability: "diffsbdd.generate",
    revision: 3,
    job: "be6389cf-e6ce-4d2e-ae5a-9786d62dfe8a",
    result: "87c304e38e2eafa8de112a5cc3e201572e1836ab91e2cd7d0338403ced59facc",
    text: [
      "原始生成结果中两个连续候选存在几何问题，另一个不连续；后续优化片段仍未经过活性验证。",
      "Both connected raw candidates have geometry issues and the third is disconnected. The subsequently refined fragment has not been activity validated.",
    ],
  },
] as const;

export function reviewedHighlight(
  info: ExampleInfo | null,
  language: Language,
) {
  if (
    !info?.pin?.review ||
    info.case.id !== "stat6-defined-molecules" ||
    info.module.case_id !== info.case.id
  )
    return null;
  const match = highlights.find(
    (item) =>
      item.capability === info.module.capability_id &&
      item.revision === info.module.revision &&
      item.job === info.pin?.job_id &&
      item.result === info.pin?.artifact_sha256?.["result.json"],
  );
  return match ? match.text[language === "zh" ? 0 : 1] : null;
}
