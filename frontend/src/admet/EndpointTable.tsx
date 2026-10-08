import { useState } from "react";
import type { Language } from "../types";
import { Hint } from "../guided/Hint";
import type { AdmetResult, AdmetRow } from "./types";
import {
  categoryLabels,
  commonEndpoints,
  endpointHint,
  endpointName,
  endpointUnit,
  speciesName,
} from "./labels";

export function EndpointTable({
  language,
  result,
  row,
}: {
  language: Language;
  result: AdmetResult;
  row: AdmetRow;
}) {
  const zh = language === "zh";
  const [category, setCategory] = useState(
    result.options.view === "safety"
      ? "Toxicity"
      : result.options.view === "adme"
        ? "adme"
        : "common",
  );
  const available = result.endpoints;
  const visible = available.filter(
    (e) =>
      category === "all" ||
      (category === "common"
        ? commonEndpoints.has(e.id)
        : category === "adme"
          ? e.category !== "Toxicity"
          : e.category === category),
  );
  return (
    <section
      className="admet-endpoints"
      aria-label={zh ? "性质预测" : "Predicted properties"}
    >
      <div className="admet-result-toolbar">
        <label className="field">
          {zh ? "结果分组" : "Result group"}
          <select
            value={category}
            onChange={(e) => setCategory(e.target.value)}
          >
            <option value="common">
              {zh ? "常用结果" : "Common endpoints"}
            </option>
            <option value="all">{zh ? "全部结果" : "All endpoints"}</option>
            <option value="adme">
              {zh ? "吸收与体内过程" : "ADME endpoints"}
            </option>
            {[...new Set(available.map((e) => e.category))].map((name) => (
              <option key={name} value={name}>
                {zh ? (categoryLabels[name] ?? name) : name}
              </option>
            ))}
          </select>
        </label>
        <span className="field-help" aria-live="polite">
          {visible.length} / {available.length}
        </span>
      </div>
      <div className="table-scroll">
        <table
          aria-label={
            zh ? "所选分子的预测性质" : "Selected molecule predictions"
          }
        >
          <thead>
            <tr>
              <th>{zh ? "预测终点" : "Endpoint"}</th>
              <th>{zh ? "模型预测" : "Model prediction"}</th>
              <th>{zh ? "单位" : "Unit"}</th>
              <th>{zh ? "物种" : "Species"}</th>
            </tr>
          </thead>
          <tbody>
            {visible.map((e) => (
              <tr key={e.id} data-endpoint-id={e.id}>
                <td>
                  <span title={e.name}>{endpointName(e, zh)}</span>
                  <Hint
                    label={endpointName(e, zh) + (zh ? "说明" : " meaning")}
                  >
                    {endpointHint(e, zh)}{" "}
                    <a href={e.source_url} target="_blank" rel="noreferrer">
                      {zh ? "原始数据集说明" : "Source dataset definition"}
                    </a>
                  </Hint>
                </td>
                <td>{row.predictions[e.id]?.toPrecision(4) ?? "—"}</td>
                <td>{endpointUnit(e, zh)}</td>
                <td>{speciesName(e.species, zh)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <details>
        <summary>
          {zh ? "验证范围与来源" : "Validation scope and provenance"}
        </summary>
        <p>
          {zh
            ? "这是模型预测，不是实验测定。分类分数不能统一当作风险百分比，也没有给出新化合物的可靠性区间。下列数值来自上游版本的参考评估，不是本次分子的验证结果。"
            : "These are model predictions, not measurements. Classification scores are not universal risk percentages or reliability intervals for new molecules. The following are upstream reference benchmarks, not validation of this molecule."}
        </p>
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>{zh ? "终点" : "Endpoint"}</th>
                <th>{zh ? "参考数据数量" : "Reference size"}</th>
                <th>{zh ? "上游参考指标" : "Upstream benchmark"}</th>
              </tr>
            </thead>
            <tbody>
              {available.map((e) => (
                <tr key={e.id}>
                  <td>{endpointName(e, zh)}</td>
                  <td>{e.source_dataset_size}</td>
                  <td>
                    {Object.entries(e.reference_metrics)
                      .map(([key, value]) => `${key}: ${value.toFixed(3)}`)
                      .join(" · ")}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </section>
  );
}
