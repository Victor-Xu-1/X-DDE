import { useState } from "react";
import type { Language } from "../types";
import { MolecularPreview } from "../presentation/MolecularPreview";
import { MetricScatter } from "../presentation/MetricScatter";
import { ResearchTable } from "../presentation/ResearchTable";
import { StructureWorkbench } from "../presentation/StructureWorkbench";
import type { NativeResult } from "./types";

export function PropertyModelResults({
  result,
  language,
}: {
  result: NativeResult;
  language: Language;
}) {
  const zh = language === "zh";
  const rows = result.validation_points.map((point, index) => ({
    ...point,
    id: String(index + 1),
    label: (zh ? "测试记录 " : "Test record ") + (index + 1),
  }));
  const [selected, setSelected] = useState("1");
  const active = rows.find((row) => row.id === selected) ?? rows[0];
  const unit = result.metrics.find(
    (metric) => metric.name === "Test RMSE",
  )?.unit;
  const label = (name: string) => name + (unit ? ` (${unit})` : "");
  const columnLabel = (name: string) => (
    <span className="property-model-column-label">
      {name}
      {unit && (
        <>
          {" "}
          <small>({unit})</small>
        </>
      )}
    </span>
  );
  const r2 = result.metrics.find((metric) => metric.name === "Test R²")?.value;
  return (
    <section
      className="property-model-review"
      aria-label={zh ? "性质模型测试集复核" : "Property model held-out review"}
    >
      {r2 !== undefined && r2 <= 0 && (
        <p className="property-model-warning" role="status">
          {zh
            ? "测试表现不足：R² ≤ 0。该模型未优于测试集均值这一统计参照，不能据此声称有可靠预测能力。请检查逐个分子的误差和适用范围。"
            : "Insufficient held-out performance: R² ≤ 0. The model did not outperform the held-out mean reference. This does not establish reliable prediction; inspect individual errors and applicability."}
        </p>
      )}
      {active && (
        <StructureWorkbench
          preview={
            <section
              aria-label={zh ? "所选测试分子" : "Selected test molecule"}
            >
              <h3>{active.label}</h3>
              <MolecularPreview
                source={{ smiles: active.smiles }}
                label={active.label}
                language={language}
              />
            </section>
          }
        >
          <MetricScatter
            rows={rows}
            identity
            language={language}
            label={
              zh
                ? "测试集：实验值与预测值"
                : "Held-out observations and predictions"
            }
            rowId={(row) => row.id}
            rowLabel={(row) => row.label}
            selected={active.id}
            onSelect={(row) => setSelected(row.id)}
            metrics={[
              {
                key: "observed",
                label: label(zh ? "实验值" : "Observed"),
                value: (row) => row.observed,
              },
              {
                key: "predicted",
                label: label(zh ? "预测值" : "Predicted"),
                value: (row) => row.predicted,
              },
            ]}
          />
          <ResearchTable
            title={zh ? "测试集逐分子误差" : "Held-out errors by molecule"}
            rows={rows}
            rowId={(row) => row.id}
            selected={active.id}
            onSelect={(row) => setSelected(row.id)}
            language={language}
            exportName="held-out-molecule-review.csv"
            columns={[
              {
                key: "record",
                label: zh ? "记录" : "Record",
                value: (row) => Number(row.id),
                render: (row) => row.id,
              },
              {
                key: "observed",
                label: columnLabel(zh ? "实验值" : "Observed"),
                exportLabel: label(zh ? "实验值" : "Observed"),
                value: (row) => row.observed,
              },
              {
                key: "predicted",
                label: columnLabel(zh ? "预测值" : "Predicted"),
                exportLabel: label(zh ? "预测值" : "Predicted"),
                value: (row) => row.predicted,
              },
              {
                key: "error",
                label: (
                  <span
                    title={zh ? "预测值减去实验值" : "Predicted minus observed"}
                  >
                    {columnLabel(zh ? "偏差" : "Error")}
                  </span>
                ),
                exportLabel: label(zh ? "预测 − 实验" : "Predicted − observed"),
                value: (row) => row.predicted - row.observed,
              },
              { key: "smiles", label: "SMILES", value: (row) => row.smiles },
            ]}
            initialVisibleColumns={["record", "observed", "predicted", "error"]}
          />
        </StructureWorkbench>
      )}
      <table
        className="compact-table"
        aria-label={zh ? "原生测试指标" : "Native test metrics"}
      >
        <tbody>
          {result.metrics.map((metric) => (
            <tr key={metric.name}>
              <th title={metric.method}>{metric.name}</th>
              <td>
                {metric.value.toPrecision(4)} {metric.unit}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="field-help">
        {zh
          ? "这些记录来自单次保留测试集。二维结构表示原始分子身份；这里不生成或假定三维结合姿势，也不代表模型已被实验验证。"
          : "These observations belong to one held-out split. The 2D drawing preserves molecular identity; no 3D binding pose or experimental model validation is implied."}
      </p>
    </section>
  );
}
