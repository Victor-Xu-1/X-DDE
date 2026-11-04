import { useState } from "react";
import { ReviewReference } from "../diffsbdd/ReviewReference";
import { MoleculeImage } from "../presentation/MoleculeImage";
import {
  PredictionJobReview,
  type PredictionJobReviewActions,
} from "../presentation/PredictionJobReview";
import { ResearchTabs } from "../presentation/ResearchTabs";
import { assetDownloadUrl } from "../research/asset-download";
import type { Language } from "../types";
import { StructureViewer } from "../viewer/StructureViewer";
import {
  moleculeFormats,
  prepareTernaryReview,
  proteinFormats,
  type PreparedTernaryReview,
  type TernaryReviewInput,
} from "./FormReviewRequest";
import { mechanismLabels, partnerRoles } from "./types";
import "./FormReview.css";

export function TernaryJobReview(
  props: PredictionJobReviewActions & { input: TernaryReviewInput },
) {
  const { language } = props;
  const zh = language === "zh";
  return (
    <PredictionJobReview
      {...props}
      wide
      prepare={prepareTernaryReview}
      preparationError={(reason) => reason}
      summary={({ payload }) =>
        `DeepTernary · ${mechanismLabels[payload.mechanism][zh ? 0 : 1]}`
      }
      renderOverview={(review) => (
        <TernaryStructures review={review} language={language} />
      )}
      renderSettings={(review) => (
        <TernarySettings review={review} language={language} />
      )}
    />
  );
}

interface ReviewProps {
  review: PreparedTernaryReview;
  language: Language;
}

function TernaryStructures({ review, language }: ReviewProps) {
  const zh = language === "zh";
  const { first, second, armA, armB, ligand, payload } = review;
  const molecule = zh ? "完整分子" : "Complete molecule";
  const moleculeUrl = assetDownloadUrl(ligand.asset_id, ligand.record);
  const reference =
    !armA &&
    first.sha256 === second.sha256 &&
    payload.partner_a_chain !== payload.partner_b_chain;
  const referenceLabel = zh ? "参考复合物" : "Reference complex";
  const partners = [
    {
      id: "a",
      protein: first,
      arm: armA,
      name: payload.partner_a_name,
      chain: payload.partner_a_chain,
    },
    {
      id: "b",
      protein: second,
      arm: armB,
      name: payload.partner_b_name,
      chain: payload.partner_b_chain,
    },
  ];
  return (
    <section
      className="ternary-review-geometry"
      aria-label={zh ? "三元建模输入结构" : "Ternary modeling input structures"}
    >
      <p className="field-help">
        {zh
          ? "按原始坐标分别显示所选输入。三元装配需在计算后查看。"
          : "Selected inputs are shown in their original coordinates. The ternary assembly is available after modeling."}
      </p>
      <ResearchTabs
        label={zh ? "输入结构视图" : "Input structure views"}
        tabs={[
          ...(reference
            ? [
                {
                  id: "reference",
                  label: referenceLabel,
                  content: (
                    <section aria-label={referenceLabel}>
                      <p className="field-help">
                        {zh
                          ? `所选链：${payload.partner_a_name} · ${payload.partner_a_chain}，${payload.partner_b_name} · ${payload.partner_b_chain}。可在所选链和完整原结构之间切换。独立提交的配体见「完整分子」。`
                          : `Selected chains: ${payload.partner_a_name} · ${payload.partner_a_chain}, ${payload.partner_b_name} · ${payload.partner_b_chain}. Switch between the selected chains and the full source structure. Review the separately submitted ligand under Complete molecule.`}
                      </p>
                      <StructureViewer
                        urls={[assetDownloadUrl(first.asset_id)]}
                        language={language}
                        sourceSnapshot
                        initialMode="cartoon"
                        initialChains={[
                          payload.partner_a_chain,
                          payload.partner_b_chain,
                        ]}
                      />
                    </section>
                  ),
                },
              ]
            : []),
          ...(reference ? [] : partners).map(
            ({ id, protein, arm, name, chain }) => ({
              id,
              label: (zh ? "蛋白 " : "Protein ") + id.toUpperCase(),
              content: (
                <>
                  <p className="field-help">
                    {name} · {zh ? "所选链 " : "Selected chain "}
                    {chain}
                    {arm &&
                      (zh
                        ? " · 叠加此端输入的片段姿势"
                        : " · supplied fragment pose overlay")}
                  </p>
                  <StructureViewer
                    urls={[
                      assetDownloadUrl(protein.asset_id),
                      ...(arm
                        ? [assetDownloadUrl(arm.asset_id, arm.record)]
                        : []),
                    ]}
                    language={language}
                    sourceSnapshot
                    focusModel={arm ? 1 : undefined}
                  />
                </>
              ),
            }),
          ),
          {
            id: "molecule",
            label: molecule,
            content: <TernaryMolecule review={review} language={language} />,
          },
          {
            id: "2d",
            label: zh ? "二维结构" : "2D drawing",
            content: (
              <MoleculeImage
                source={{ url: moleculeUrl }}
                label={molecule}
                language={language}
              />
            ),
          },
        ]}
      />
    </section>
  );
}

function TernaryMolecule({ review, language }: ReviewProps) {
  const zh = language === "zh";
  const { ligand, payload, armA } = review;
  const regions = armA
    ? [payload.arm_a_map, payload.arm_b_map]
    : [payload.binding_region_a, payload.binding_region_b];
  const [side, setSide] = useState(0);
  const highlight = regions[side];
  return (
    <>
      {payload.mechanism !== "molecular_glue" &&
        regions.some((region) => region.length > 0) && (
          <div
            className="ternary-review-regions"
            role="group"
            aria-label={zh ? "检查选定原子" : "Inspect selected atoms"}
          >
            {regions.map((region, index) => (
              <button
                key={index}
                type="button"
                className="secondary-button"
                aria-pressed={side === index}
                onClick={() => setSide(index)}
              >
                {index === 0 ? "A" : "B"} · {region.length}{" "}
                {zh ? "个选定原子" : "selected atoms"}
              </button>
            ))}
          </div>
        )}
      <StructureViewer
        urls={[assetDownloadUrl(ligand.asset_id, ligand.record)]}
        language={language}
        sourceSnapshot
        selectionMode={highlight.length ? "atom" : undefined}
        highlightedAtoms={highlight}
      />
    </>
  );
}

function TernarySettings({ review, language }: ReviewProps) {
  const zh = language === "zh";
  const { task, payload, armA, armB, first, second, ligand } = review;
  const [roleA, roleB] = partnerRoles(payload.mechanism, zh);
  const mechanism =
    payload.mechanism === "molecular_glue"
      ? "glue"
      : armA
        ? "binary"
        : "shared";
  const protocols = {
    glue: zh ? "分子胶界面探索" : "Molecular-glue interface",
    binary: zh ? "两端独立的结合姿势" : "Two separate bound poses",
    shared: zh ? "完整参考复合物" : "Reference complex",
  };
  const title = zh ? "装配方案" : "Assembly plan";
  const material = zh ? "输入文件" : "Input files";
  return (
    <aside className="job-review-settings" aria-label={title}>
      <h3>{title}</h3>
      <dl>
        <div>
          <dt>{zh ? "结构依据" : "Structural evidence"}</dt>
          <dd>{protocols[mechanism]}</dd>
        </div>
        <div>
          <dt>{zh ? "固定蛋白" : "Fixed protein"}</dt>
          <dd>
            {payload.anchor_partner === "b"
              ? payload.partner_b_name
              : payload.partner_a_name}
          </dd>
        </div>
        <div>
          <dt>{zh ? "目标装配数" : "Target assemblies"}</dt>
          <dd>{payload.samples}</dd>
        </div>
        <div>
          <dt>{zh ? "尝试上限" : "Attempt limit"}</dt>
          <dd>{payload.attempt_budget}</dd>
        </div>
        <div>
          <dt>{zh ? "时间上限" : "Time limit"}</dt>
          <dd>
            {payload.wall_seconds} {zh ? "秒" : "s"}
          </dd>
        </div>
        <div>
          <dt>{zh ? "计算资源" : "Compute resources"}</dt>
          <dd>
            {task.options.cpu} CPU · {task.options.memory_mib / 1024} GiB
          </dd>
        </div>
      </dl>
      <h3>{material}</h3>
      <ul className="job-review-chain-list" aria-label={material}>
        {[
          {
            label: zh ? "完整分子" : "Complete molecule",
            source: ligand,
            molecule: true,
          },
          {
            label: `A · ${roleA} · ${payload.partner_a_name} · ${zh ? "链" : "Chain"} ${payload.partner_a_chain}`,
            source: first,
          },
          {
            label: `B · ${roleB} · ${payload.partner_b_name} · ${zh ? "链" : "Chain"} ${payload.partner_b_chain}`,
            source: second,
          },
          {
            label: zh ? "A 端结合片段" : "A · Bound fragment",
            source: armA,
            molecule: true,
          },
          {
            label: zh ? "B 端结合片段" : "B · Bound fragment",
            source: armB,
            molecule: true,
          },
        ].map(
          ({ label, source, molecule }) =>
            source && (
              <li key={label}>
                <strong>{label}</strong>
                <ReviewReference
                  reference={source}
                  kind={molecule ? "ligand" : "structure"}
                  language={language}
                  allowedFormats={molecule ? moleculeFormats : proteinFormats}
                  recordDownload={molecule}
                />
              </li>
            ),
        )}
      </ul>
    </aside>
  );
}
