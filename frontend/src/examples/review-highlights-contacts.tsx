import type { Language } from "../types";
import type { ExampleInfo } from "./types";
import data from "./review-highlights-contact-data.json";
import { matchesReviewedSources } from "./reviewed-sources";

/** Only show the saved geometric review for the exact native sources it used. */
export function hasReviewedReferenceContacts(
  info: ExampleInfo | null,
  jobId: string,
) {
  return matchesReviewedSources(info, jobId, {
    ...data,
    supporting: data.supporting.map((expected) => ({
      job_id: expected.job_id,
      artifact_sha256: { "result.json": expected.result_sha256 },
    })),
  });
}

export function ReviewedReferenceContacts({
  language,
}: {
  language: Language;
}) {
  const zh = language === "zh";
  const csv = [
    "pose,reference,cutoff_angstrom,shared_residues,shared_count,reference_count,independent_quality_job",
    ...data.poses.map((pose) =>
      [
        pose.pose,
        "9BIG AK-1690",
        data.cutoff_angstrom,
        `"${pose.shared_residues.join("; ")}"`,
        pose.shared_residues.length,
        data.reference_contacts.length,
        pose.independent_quality_job ?? "",
      ].join(","),
    ),
  ].join("\r\n");
  return (
    <details className="example-result-review">
      <summary>{zh ? "参考区域接触比较" : "Reference-region contacts"}</summary>
      <p>
        {zh
          ? "9BIG 的 AK-1690 是参考配体，不是指定分子的实验姿势。以下按 4.5 Å 重原子距离比较同一受体中的接触残基，仅表示几何接近，不代表结合强度、活性或姿势准确度。"
          : "AK-1690 in 9BIG is a reference ligand, not an experimental pose of the studied molecule. Contacts use a 4.5 Å heavy-atom cutoff in the same receptor frame; proximity does not establish binding strength, activity, or pose accuracy."}{" "}
        <a
          href="https://www.rcsb.org/structure/9BIG"
          target="_blank"
          rel="noreferrer"
        >
          9BIG ↗
        </a>
      </p>
      <p>
        {zh
          ? `参考接触残基：${data.reference_contacts.length} 个`
          : `Reference contact residues: ${data.reference_contacts.length}`}
      </p>
      <a
        download="stat6-9big-reference-contacts.csv"
        href={`data:text/csv;charset=utf-8,${encodeURIComponent("\ufeff" + csv)}`}
      >
        {zh ? "下载接触比较" : "Download contact comparison"}
      </a>
      <div className="reference-contacts-table-wrap">
        <table
          aria-label={zh ? "参考区域接触比较" : "Reference-region contacts"}
        >
          <thead>
            <tr>
              <th scope="col">{zh ? "姿势" : "Pose"}</th>
              <th scope="col">{zh ? "共同残基" : "Shared residues"}</th>
              <th scope="col">{zh ? "共同 / 参考" : "Shared / reference"}</th>
              <th scope="col">{zh ? "独立质控" : "Independent quality"}</th>
            </tr>
          </thead>
          <tbody>
            {data.poses.map((pose) => (
              <tr key={pose.pose}>
                <th scope="row">
                  {zh ? `姿势 ${pose.pose}` : `Pose ${pose.pose}`}
                </th>
                <td>{pose.shared_residues.join(", ")}</td>
                <td>
                  {pose.shared_residues.length} /{" "}
                  {data.reference_contacts.length}
                </td>
                <td>
                  {pose.independent_quality_job
                    ? zh
                      ? "已评估，部分未评估"
                      : "Assessed; some checks missing"
                    : zh
                      ? "本次未评估"
                      : "Not assessed here"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p>
        {zh
          ? "接触重合多不代表姿势更可靠；请选择上方研究阶段查看对应质控详情。"
          : "More shared contacts do not establish a better pose. Select the corresponding study stage above for quality details."}
      </p>
    </details>
  );
}
