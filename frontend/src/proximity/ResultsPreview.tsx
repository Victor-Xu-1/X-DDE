import { artifactUrl } from "../api";
import { MoleculeImage } from "../presentation/MoleculeImage";
import { ResearchTabs } from "../presentation/ResearchTabs";
import type { Job, Language } from "../types";
import { StructureViewer } from "../viewer/StructureViewer";
import { attachmentAtom } from "./AttachmentDirections";
import { AssemblyFiles } from "./AssemblyFiles";
import type { AssemblyProposal, AttachmentBond, TernaryResult } from "./types";

export function ResultsPreview({
  job,
  result,
  assembly,
  label,
  language,
  view,
  onView,
  attachments,
  selectedBond,
}: {
  job: Job;
  result: TernaryResult;
  assembly: AssemblyProposal;
  label: string;
  language: Language;
  view: string;
  onView(id: string): void;
  attachments: AttachmentBond[];
  selectedBond: string | null;
}) {
  const zh = language === "zh";
  const complex = artifactUrl(job.id, assembly.complex_artifact);
  const ligand = artifactUrl(job.id, assembly.ligand_artifact);
  const molecule = { url: ligand, record: 0 };
  const markers = attachments
    .filter(
      (row) =>
        row.direction !== null && (!selectedBond || row.id === selectedBond),
    )
    .map((row) => ({
      origin: row.origin,
      target: row.target,
      fromAtom: result.ligand_atom_indices.indexOf(row.region_atom),
      toAtom: result.ligand_atom_indices.indexOf(row.outside_atom),
      region: row.region,
      label: attachmentAtom(row, true) + " → " + attachmentAtom(row, false),
    }));
  const status = assembly.quality.accepted
    ? zh
      ? "基本几何通过"
      : "Basic geometry passed"
    : zh
      ? "诊断结构 · 几何待复核"
      : "Diagnostic · Review geometry";
  return (
    <section
      className="proximity-assembly-preview"
      aria-label={zh ? "完整装配预览" : "Complete assembly preview"}
    >
      <header className="proximity-preview-heading">
        <div className="proximity-preview-identity">
          <strong>{label}</strong>
          <span
            className={
              assembly.quality.accepted
                ? "proximity-check-pass"
                : "proximity-check-fail"
            }
          >
            {status}
          </span>
        </div>
        <AssemblyFiles complex={complex} ligand={ligand} language={language} />
      </header>
      <ResearchTabs
        key={assembly.id}
        label={zh ? "装配视图" : "Assembly view"}
        active={view}
        onChange={onView}
        tabs={[
          {
            id: "assembly",
            label: zh ? "完整复合物" : "Complete complex",
            content: (
              <StructureViewer
                sourceSnapshot
                initialMode="cartoon"
                urls={[complex]}
                molecularSource={molecule}
                language={language}
              />
            ),
          },
          {
            id: "ligand",
            label: zh ? "分子三维" : "Molecule 3D",
            content: (
              <StructureViewer
                sourceSnapshot
                urls={[ligand]}
                language={language}
              />
            ),
          },
          {
            id: "drawing",
            label: zh ? "分子二维" : "Molecule 2D",
            content: (
              <MoleculeImage
                label={label}
                source={molecule}
                language={language}
              />
            ),
          },
          ...(attachments.length
            ? [
                {
                  id: "attachments",
                  label: zh ? "连接位点" : "Attachment sites",
                  content: (
                    <StructureViewer
                      sourceSnapshot
                      initialMode="pocket"
                      urls={[complex]}
                      molecularSource={molecule}
                      language={language}
                      attachmentGeometry={{ points: markers }}
                    />
                  ),
                },
              ]
            : []),
        ]}
      />
      <StructureScope job={job} result={result} zh={zh} />
    </section>
  );
}

function StructureScope({
  job,
  result,
  zh,
}: {
  job: Job;
  result: TernaryResult;
  zh: boolean;
}) {
  const anchor = result.search.anchor_partner;
  const anchorName =
    job.request.operation === "ternary_model" && anchor
      ? job.request.payload[
          anchor === "b" ? "partner_b_name" : "partner_a_name"
        ]
      : null;
  return (
    <details className="proximity-scope">
      <summary>
        {zh ? "结构范围与结果说明" : "Structure scope and interpretation"}
      </summary>
      {anchor && (
        <p className="proximity-caption">
          {zh ? "固定蛋白：" : "Fixed protein: "}
          {typeof anchorName === "string" ? anchorName : anchor.toUpperCase()}.
          {zh
            ? "模型排序分数仅用于相同固定端方案内比较。"
            : " Compare model ranking scores within the same fixed-partner protocol."}
        </p>
      )}
      <p className="proximity-caption">
        {zh
          ? "链 A：伙伴 1 · 链 B：伙伴 2 · 链 L：完整分子"
          : "Chain A: partner 1 · Chain B: partner 2 · Chain L: complete molecule"}
      </p>
      <p className="proximity-caption">
        {zh
          ? "本次建模覆盖两个核心蛋白链与完整分子。其他亚基和辅因子需另行评估。"
          : "This model covers the two principal protein chains and the complete molecule. Accessory subunits and cofactors require separate assessment."}
      </p>
      <p className="proximity-caption">
        {zh
          ? "降解、协同性、效应抑制和细胞活性需各自验证。"
          : "Degradation, cooperativity, effector inhibition and cellular activity require separate validation."}
      </p>
    </details>
  );
}
