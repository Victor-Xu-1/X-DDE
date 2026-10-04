import type { Language } from "../types";
import type { LibraryScreenResult, ScreenRow } from "./screen-types";

export function StructuralAlertCell({
  row,
  language,
}: {
  row: ScreenRow;
  language: Language;
}) {
  const zh = language === "zh",
    alerts = row.structural_alerts;
  if (alerts == null) return <span>{zh ? "未完成检查" : "Not evaluated"}</span>;
  if (!alerts.length)
    return (
      <span
        title={
          zh
            ? "未命中所选规则，不代表已证明安全。"
            : "No selected rule matches; safety has not been established."
        }
      >
        {zh ? "未命中规则" : "No rule matches"}
      </span>
    );
  return (
    <details className="library-alerts">
      <summary
        title={
          zh
            ? "点击查看具体规则；命中不等于有毒或无活性。"
            : "Show the matched rules; a match does not establish toxicity or inactivity."
        }
      >
        {zh ? `需核查：${alerts.length} 条` : `Review: ${alerts.length} rules`}
      </summary>
      <ul>
        {alerts.map((alert) => (
          <li key={alert.catalogue + alert.rule}>
            {alert.catalogue === "BRENK" ? "Brenk" : "PAINS"} · {alert.rule}
          </li>
        ))}
      </ul>
    </details>
  );
}

export function ScaffoldCell({
  row,
  groups,
  language,
}: {
  row: ScreenRow;
  groups: LibraryScreenResult["scaffold_groups"];
  language: Language;
}) {
  const zh = language === "zh",
    group = groups?.find((item) => item.index === row.scaffold_group);
  if (!group) return <span>{zh ? "未分组" : "Not grouped"}</span>;
  return (
    <span
      title={
        (group.kind === "acyclic"
          ? zh
            ? "无环分子按自身结构分组："
            : "Acyclic molecule grouped by its own structure: "
          : zh
            ? "Murcko 骨架："
            : "Murcko scaffold: ") + group.smiles
      }
    >
      {group.kind === "acyclic"
        ? zh
          ? "无环组"
          : "Acyclic family"
        : zh
          ? "骨架"
          : "Scaffold"}{" "}
      {group.index + 1}
      <small>
        {zh
          ? `${group.records.length} 个原始分子`
          : `${group.records.length} input molecules`}
      </small>
    </span>
  );
}
