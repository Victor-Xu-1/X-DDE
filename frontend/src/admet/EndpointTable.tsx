import { useState } from "react";
import type { Language } from "../types";
import { Hint } from "../guided/Hint";
import type { AdmetResult, AdmetRow } from "./types";
import {
  categoryLabels,
  commonEndpoints,
  endpointHint,
  endpointName,
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
  const zh = language === "zh",
    [all, setAll] = useState(false),
    [category, setCategory] = useState("");
  const available = result.endpoints.filter(
    (e) =>
      result.options.view === "all" ||
      (result.options.view === "safety") === (e.category === "Toxicity"),
  );
  const visible = available.filter(
    (e) =>
      (!category || e.category === category) &&
      (all || category || commonEndpoints.has(e.id)),
  );
  return (
    <section aria-label={zh ? "性质预测" : "Predicted properties"}>
      <div className="admet-result-toolbar">
        <label className="field">
          {zh ? "结果分组" : "Result group"}
          <select
            value={category}
            onChange={(e) => setCategory(e.target.value)}
          >
            <option value="">{zh ? "常用结果" : "Common endpoints"}</option>
            {[...new Set(available.map((e) => e.category))].map((name) => (
              <option key={name} value={name}>
                {zh ? (categoryLabels[name] ?? name) : name}
              </option>
            ))}
          </select>
        </label>
        <label className="checkbox-line">
          <input
            type="checkbox"
            checked={all}
            onChange={(e) => setAll(e.target.checked)}
          />
          {zh ? "显示全部终点" : "Show every endpoint"}
        </label>
      </div>
      <div className="table-scroll">
        <table>
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
              <tr key={e.id}>
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
                <td>
                  {e.task_type === "classification"
                    ? zh
                      ? "分数 0–1"
                      : "Score 0–1"
                    : e.unit}
                </td>
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
