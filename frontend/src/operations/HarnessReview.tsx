import type { Language } from "../types";
import { Fragment } from "react";
import { harnessFields } from "./harness-fields";
import { tools } from "./catalog";
import type { Asset } from "./types";

function summary(value: unknown, kind: string, zh: boolean): string | null {
  if (kind === "chain-list" && Array.isArray(value)) return value.join(", ");
  if ((kind === "sequence" || kind === "lines") && value) {
    const values = Array.isArray(value) ? value : [value];
    return values
      .map(
        (sequence, index) =>
          `${index + 1}: ${String(sequence).replace(/\s/g, "").length} aa`,
      )
      .join("; ");
  }
  if (kind === "chains" && value && typeof value === "object")
    return Object.entries(value)
      .map(([chain, sequence]) => `${chain}: ${String(sequence).length} aa`)
      .join("; ");
  if (kind === "positions" && value && typeof value === "object") {
    const count = Array.isArray(value)
      ? value.length
      : Object.values(value).reduce<number>(
          (total, positions) =>
            total + (Array.isArray(positions) ? positions.length : 0),
          0,
        );
    return zh ? `${count} 个位置` : `${count} positions`;
  }
  if (kind === "number" && typeof value === "number" && Number.isFinite(value))
    return String(value);
  if (
    (kind === "text" || kind === "choice") &&
    (typeof value === "string" || typeof value === "boolean")
  )
    return String(value);
  return null;
}

export function HarnessReview({
  tool,
  payload,
  assets,
  name,
  expert,
  external,
  language,
}: {
  tool: string;
  payload: Record<string, unknown>;
  assets: readonly Asset[];
  name: string;
  expert: boolean;
  external: boolean;
  language: Language;
}) {
  const zh = language === "zh",
    method = tools.find((item) => item.id === tool);
  return (
    <dl className="questionnaire-review">
      <dt>{zh ? "研究方法" : "Research method"}</dt>
      <dd>
        {method?.label[zh ? 0 : 1] ?? tool}
        {method ? ` · ${method.source}` : ""}
      </dd>
      {assets.length > 0 && (
        <>
          <dt>{zh ? "研究文件" : "Research files"}</dt>
          <dd>
            <ul>
              {assets.map((asset) => (
                <li key={asset.id}>
                  <a href={`/api/assets/${asset.id}`} download>
                    {asset.name}
                  </a>
                </li>
              ))}
            </ul>
          </dd>
        </>
      )}
      {(harnessFields[tool] ?? []).map((field) => {
        const value = summary(payload[field.key], field.kind, zh);
        if (!value) return null;
        const choice = field.choices?.find(
          (item) => item.value === payload[field.key],
        );
        return (
          <Fragment key={field.key}>
            <dt>{field.label[zh ? 0 : 1]}</dt>
            <dd>{choice?.label[zh ? 0 : 1] ?? value}</dd>
          </Fragment>
        );
      })}
      {name.trim() && (
        <>
          <dt>{zh ? "任务名称" : "Task name"}</dt>
          <dd>{name.trim()}</dd>
        </>
      )}
      <dt>{zh ? "参数模式" : "Parameter mode"}</dt>
      <dd>
        {expert
          ? zh
            ? "专家参数"
            : "Expert parameters"
          : zh
            ? "推荐方案及已选可选设置"
            : "Recommended settings and chosen adjustments"}
      </dd>
      <dt>{zh ? "服务调用" : "Service calls"}</dt>
      <dd>
        {external
          ? zh
            ? "已确认使用配置的外部服务"
            : "Configured external services approved"
          : zh
            ? "由服务器管理的计算环境"
            : "Server-managed compute environment"}
      </dd>
    </dl>
  );
}
