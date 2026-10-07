import { useMemo, useState } from "react";
import { artifactUrl } from "../api";
import {
  ResearchTable,
  type ResearchColumn,
} from "../presentation/ResearchTable";
import { StructureViewer } from "../viewer/StructureViewer";
import { MoleculeImage } from "../presentation/MoleculeImage";
import { ResearchTabs } from "../presentation/ResearchTabs";
import { AssemblyQualityView, assemblyClashes } from "./Quality";
import {
  mechanismLabels,
  type AssemblyProposal,
  type TernaryResult,
} from "./types";
import type { Job, Language } from "../types";
import "./proximity.css";
import { AttachmentDirections } from "./AttachmentDirections";

export function ProximityResults({
  job,
  result,
  language,
}: {
  job: Job;
  result: TernaryResult;
  language: Language;
}) {
  const zh = language === "zh",
    rows = result.assemblies;
  const [selected, setSelected] = useState(
    rows.find((r) => r.quality.accepted)?.id ?? rows[0]?.id ?? "",
  );
  const active = rows.find((r) => r.id === selected) ?? rows[0];
  const qualified = rows.filter((r) => r.quality.accepted).length;
  const columns = useMemo<ResearchColumn<AssemblyProposal>[]>(
    () => [
      {
        key: "id",
        label: zh ? "装配" : "Assembly",
        value: (r) => r.id,
        render: (r) => (
          <strong>
            {(zh ? "装配 " : "Assembly ") + Number(r.id.split("-")[1])}
          </strong>
        ),
      },
      {
        key: "geometry",
        label: zh ? "几何检查" : "Geometry",
        exportLabel: zh ? "基本几何检查" : "Basic geometry assessment",
        value: (r) =>
          r.quality.accepted
            ? zh
              ? "通过"
              : "Passed"
            : zh
              ? "需检查"
              : "Review",
        render: (r) => (
          <span
            className={
              r.quality.accepted
                ? "proximity-check-pass"
                : "proximity-check-fail"
            }
          >
            {r.quality.accepted
              ? zh
                ? "通过"
                : "Passed"
              : zh
                ? "需检查"
                : "Review"}
          </span>
        ),
      },
      {
        key: "contactsA",
        label: zh ? "端 1 接触" : "Contacts 1",
        exportLabel: "Partner 1 contacting heavy atoms",
        value: (r) => r.quality.arms[0].contacting_heavy_atoms,
        numeric: true,
      },
      {
        key: "contactsB",
        label: zh ? "端 2 接触" : "Contacts 2",
        exportLabel: "Partner 2 contacting heavy atoms",
        value: (r) => r.quality.arms[1].contacting_heavy_atoms,
        numeric: true,
      },
      {
        key: "clashes",
        label: zh ? "严重碰撞" : "Clashes",
        exportLabel: "Severe atom clashes",
        value: assemblyClashes,
        numeric: true,
      },
    ],
    [zh],
  );
  const url = (name: string) => artifactUrl(job.id, name);
  return (
    <div className="proximity-results" lang={language}>
      <div className="proximity-result-heading">
        <h2>
          {mechanismLabels[result.mechanism][zh ? 0 : 1]} ·{" "}
          {zh ? "三元装配" : "Ternary assemblies"}
        </h2>
        <span className="proximity-caption">
          {zh ? "结构假设" : "Structural hypotheses"}
        </span>
      </div>
      <dl className="proximity-summary">
        <div>
          <dt>{zh ? "生成装配" : "Generated"}</dt>
          <dd>
            {rows.length}
            <span className="proximity-request-count">
              {" "}
              / {result.search.requested}
            </span>
          </dd>
        </div>
        <div>
          <dt>{zh ? "基本几何通过" : "Basic geometry passed"}</dt>
          <dd>{qualified}</dd>
        </div>
      </dl>
      {result.search.returned < result.search.requested && (
        <p role="status" className="notice">
          {zh
            ? "已到达探索预算，以下展示实际返回的装配。"
            : "The exploration budget was reached. Actual returned assemblies are shown below."}
        </p>
      )}
      {!active ? (
        <p role="status">
          {zh
            ? "当前预算内没有生成装配。请检查结合姿势与材料后重新设置探索方案。"
            : "No assembly was generated within this budget. Review the bound poses and materials before another exploration."}
        </p>
      ) : (
        <div className="proximity-result-layout">
          <div className="proximity-comparison">
            <ResearchTable
              rows={rows}
              columns={columns}
              rowId={(r) => r.id}
              language={language}
              title={zh ? "装配比较" : "Compare assemblies"}
              selected={active.id}
              onSelect={(r) => setSelected(r.id)}
              exportName="ternary-assemblies.csv"
            />
            <AssemblyQualityView
              assembly={active}
              mechanism={result.mechanism}
              language={language}
            />
          </div>
          <section
            className="proximity-assembly-preview"
            aria-label={zh ? "完整装配预览" : "Complete assembly preview"}
          >
            <ResearchTabs
              label={zh ? "装配视图" : "Assembly view"}
              tabs={[
                {
                  id: "assembly",
                  label: zh ? "完整复合物" : "Complete complex",
                  content: (
                    <StructureViewer
                      initialMode="cartoon"
                      key={active.id + "-complex"}
                      urls={[url(active.complex_artifact)]}
                      molecularSource={{
                        url: url(active.ligand_artifact),
                        record: 0,
                      }}
                      language={language}
                    />
                  ),
                },
                {
                  id: "ligand",
                  label: zh ? "分子三维" : "Molecule 3D",
                  content: (
                    <StructureViewer
                      key={active.id + "-ligand"}
                      urls={[url(active.ligand_artifact)]}
                      language={language}
                    />
                  ),
                },
                {
                  id: "drawing",
                  label: zh ? "分子二维" : "Molecule 2D",
                  content: (
                    <MoleculeImage
                      label={active.id}
                      source={{ url: url(active.ligand_artifact), record: 0 }}
                      language={language}
                    />
                  ),
                },
                ...(result.attachment_geometry?.assemblies.some(
                  (row) => row.id === active.id && row.bonds.length,
                )
                  ? [
                      {
                        id: "attachments",
                        label: zh ? "连接位点" : "Attachment sites",
                        content: (
                          <AttachmentDirections
                            key={active.id}
                            job={job}
                            assembly={active}
                            result={result}
                            language={language}
                          />
                        ),
                      },
                    ]
                  : []),
              ]}
            />
            <nav
              className="proximity-downloads"
              aria-label={zh ? "下载结构" : "Download structures"}
            >
              <a href={url(active.complex_artifact)} download>
                {zh ? "下载完整复合物" : "Download complete complex"}
              </a>
              <a href={url(active.ligand_artifact)} download>
                {zh ? "下载分子 SDF" : "Download molecule SDF"}
              </a>
            </nav>
            {!active.quality.accepted && (
              <p className="proximity-caption">
                {zh
                  ? "该结构供诊断与调整，不是通过几何检查的可复用候选。"
                  : "This is a diagnostic structure, not a reusable candidate passing basic geometry."}
              </p>
            )}
            <p className="proximity-caption">
              {zh
                ? "链 A：伙伴 1 · 链 B：伙伴 2 · 链 L：完整分子"
                : "Chain A: partner 1 · Chain B: partner 2 · Chain L: complete molecule"}
            </p>
            <p className="proximity-caption">
              {zh
                ? "本次只建模两个核心蛋白链与完整分子；其他亚基和辅因子需要另行评估。"
                : "This models two principal protein chains and the complete molecule. Accessory subunits and cofactors require separate assessment."}
            </p>
          </section>
        </div>
      )}
      <p className="proximity-caption">
        {zh
          ? "三元装配不证明降解、协同性、效应抑制或细胞活性。"
          : "A ternary assembly does not establish degradation, cooperativity, effector inhibition or cellular activity."}
      </p>
    </div>
  );
}
