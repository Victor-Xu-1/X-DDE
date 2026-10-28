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
    capability: "gnina.dock",
    revision: 5,
    job: "cf623a70-e687-47d1-9727-4433dc6429b5",
    result: "a0cd9fe2e3405f1aea4094fd3e683bb91c3c032b355e334fce56049c3e1bdf3b",
    supporting: [
      {
        job: "8969b071-879b-4374-9044-f9108ba29588",
        result:
          "b2ddd68b1d5c298a1850080ac41bfc5a7a94202b294dc41600e85c5e665521df",
      },
      {
        job: "ca498efb-cb18-40ca-9262-c2597ab422da",
        result:
          "639c5abca478299a191aa45a0b21880ec1d3c083cb41aca2caadeed22b306e8d",
      },
    ],
    text: [
      "仅姿势 3 和 9 有独立质控；默认姿势 1 尚无对应质控。对接分数不是实测亲和力，姿势仍需实验验证。",
      "Only poses 3 and 9 have independent quality checks; the default pose 1 has none in this study. Docking scores are not measured affinity, and poses require experimental validation.",
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
      item.result === info.pin?.artifact_sha256?.["result.json"] &&
      (!("supporting" in item) ||
        item.supporting.every((expected) =>
          info.pin?.supporting_evidence?.some(
            (actual) =>
              actual.job_id === expected.job &&
              actual.artifact_sha256?.["result.json"] === expected.result,
          ),
        )),
  );
  return match ? match.text[language === "zh" ? 0 : 1] : null;
}
