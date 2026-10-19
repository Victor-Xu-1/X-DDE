import {
  ResearchTable,
  type ResearchColumn,
} from "../presentation/ResearchTable";
import type { Language } from "../types";
import {
  addressLabel,
  type ChainCorrespondence,
  type ComparisonResult,
  type NativeInterface,
} from "./types";

export function InterfaceTable({
  result,
  language,
}: {
  result: ComparisonResult;
  language: Language;
}) {
  const zh = language === "zh";
  const columns: ResearchColumn<NativeInterface>[] = [
    {
      key: "interface",
      label: zh ? "参照界面" : "Reference interface",
      value: (r) => `${r.target.reference} / ${r.partner.reference}`,
    },
    {
      key: "moving",
      label: zh ? "比较界面" : "Comparison interface",
      value: (r) => `${r.target.moving} / ${r.partner.moving}`,
    },
    {
      key: "status",
      label: zh ? "状态" : "Status",
      value: (r) =>
        r.metrics
          ? zh
            ? "已评估"
            : "Evaluated"
          : zh
            ? "参照中无界面"
            : "No reference interface",
    },
    ...(
      [
        "DockQ",
        "F1",
        "fnat",
        "fnonnat",
        "iRMSD",
        "LRMSD",
        "nat_correct",
        "nat_total",
        "nonnat_count",
        "model_total",
        "clashes",
      ] as const
    ).map((key) => ({
      key,
      label: {
        fnat: zh ? "保留接触比例" : "Retained contact fraction",
        fnonnat: zh ? "新增接触比例" : "Non-native contact fraction",
        nat_correct: zh ? "保留接触" : "Retained contacts",
        nat_total: zh ? "参照接触" : "Reference contacts",
        nonnat_count: zh ? "新增接触" : "Non-native contacts",
        model_total: zh ? "比较接触" : "Comparison contacts",
        clashes: zh ? "冲突残基对" : "Clashing residue pairs",
        iRMSD: "iRMSD (Å)",
        LRMSD: "LRMSD (Å)",
        DockQ: "DockQ",
        F1: "F1",
      }[key],
      numeric: true,
      value: (r: NativeInterface) => r.metrics?.[key] ?? null,
    })),
  ];
  return (
    <>
      <ResearchTable
        title={zh ? "原生界面指标" : "Native interface metrics"}
        rows={result.native_quality.interfaces}
        columns={columns}
        language={language}
        rowId={(r) => JSON.stringify([r.target, r.partner])}
        compare={false}
        initialVisibleColumns={[
          "interface",
          "moving",
          "DockQ",
          "fnat",
          "iRMSD",
          "LRMSD",
        ]}
        exportName="interface-metrics.csv"
      />
      <p className="field-help">
        {zh
          ? "DockQ 的 LRMSD 使用其原生骨架与受体选择规则；它不同于上方的靶蛋白对齐后 Cα RMSD。"
          : "Native DockQ LRMSD uses its own backbone and receptor assignment. It differs from target-conditioned Cα RMSD above."}
      </p>
    </>
  );
}

export function CoverageTable({
  result,
  language,
}: {
  result: ComparisonResult;
  language: Language;
}) {
  const zh = language === "zh";
  const columns: ResearchColumn<ChainCorrespondence>[] = [
    {
      key: "role",
      label: zh ? "角色" : "Role",
      value: (r) =>
        r.role === "target"
          ? zh
            ? "靶蛋白"
            : "Target"
          : zh
            ? "伙伴"
            : "Partner",
    },
    {
      key: "chains",
      label: zh ? "参照 → 比较" : "Reference → comparison",
      value: (r) => `${r.reference_chain} → ${r.moving_chain}`,
    },
    {
      key: "matched",
      label: zh ? "匹配 Cα" : "Matched Cα",
      numeric: true,
      value: (r) => r.matched,
    },
    {
      key: "identity",
      label: zh ? "一致性（%）" : "Identity (%)",
      numeric: true,
      value: (r) => r.identity * 100,
    },
    {
      key: "reference",
      label: zh ? "参照覆盖率（%）" : "Reference coverage (%)",
      numeric: true,
      value: (r) => r.reference_coverage * 100,
    },
    {
      key: "moving",
      label: zh ? "比较覆盖率（%）" : "Comparison coverage (%)",
      numeric: true,
      value: (r) => r.moving_coverage * 100,
    },
  ];
  const unmatched = result.chain_correspondence.flatMap((record) =>
    (["reference", "moving"] as const).flatMap((side) =>
      record[`unmatched_${side}`].map((residue) => ({ side, residue })),
    ),
  );
  return (
    <>
      <ResearchTable
        rows={result.chain_correspondence}
        columns={columns}
        rowId={(r) => `${r.role}:${r.reference_chain}:${r.moving_chain}`}
        title={zh ? "链对应与覆盖率" : "Chain correspondence and coverage"}
        language={language}
        compare={false}
      />
      <p className="field-help">
        {zh
          ? "覆盖率仅针对两个输入中已观测到的 Cα；不等于完整蛋白序列的覆盖率。"
          : "Coverage uses observed Cα residues in the supplied structures, not the full protein sequence."}
      </p>
      <details>
        <summary>
          {zh ? "未匹配的观测残基" : "Unmatched observed residues"} ·{" "}
          {unmatched.length}
        </summary>
        <ResearchTable
          rows={unmatched}
          rowId={(r) => r.side + addressLabel(r.residue)}
          compare={false}
          language={language}
          title={zh ? "未匹配观测" : "Unmatched observations"}
          columns={[
            {
              key: "side",
              label: zh ? "结构" : "Structure",
              value: (r) =>
                r.side === "reference"
                  ? zh
                    ? "参照"
                    : "Reference"
                  : zh
                    ? "比较"
                    : "Comparison",
            },
            {
              key: "residue",
              label: zh ? "残基" : "Residue",
              value: (r) => addressLabel(r.residue),
            },
          ]}
        />
      </details>
    </>
  );
}
