import { PlusOutlined } from "@ant-design/icons";
import type { Language } from "../types";

const references = [
  {
    id: "7RPZ",
    name: "KRAS G12D",
    detail: ["小分子抑制剂参考结构", "Reference small-molecule complex"],
  },
  {
    id: "5P9J",
    name: "BTK",
    detail: ["靶标与抑制剂共晶结构", "BTK inhibitor crystal structure"],
  },
  {
    id: "6LU7",
    name: "SARS-CoV-2 Mpro",
    detail: ["公开实验参考结构", "Public experimental structure"],
  },
  {
    id: "7BZ5",
    name: "抗体–抗原 (ABAG)",
    detail: ["中和抗体参考结构", "Antibody–antigen reference"],
  },
] as const;
export function ReferenceProjects({
  language,
  onChoose,
  onNew,
}: {
  language: Language;
  onChoose(id: string): void;
  onNew(): void;
}) {
  const zh = language === "zh";
  return (
    <section className="reference-section">
      <div className="reference-title">
        <h3>
          {zh ? "点击体验：公开实验结构" : "Explore experimental structures"}
        </h3>
        <small>
          {zh
            ? "公开实验结构 · 仅用于浏览参考，不是预测结果"
            : "Public experimental structures · reference only"}
        </small>
      </div>
      <div className="reference-list">
        {references.map((ref) => (
          <button
            onClick={() => onChoose(ref.id)}
            className="reference-card"
            key={ref.id}
          >
            <iframe
              src={`/viewer.html?reference=${ref.id}&compact=1`}
              title={`${ref.name} ${zh ? "实验参考缩略图" : "reference preview"}`}
              tabIndex={-1}
              loading="lazy"
            />
            <span>
              <strong>
                {!zh && ref.id === "7BZ5"
                  ? "Antibody–antigen (ABAG)"
                  : ref.name}
              </strong>
              <small>{ref.detail[zh ? 0 : 1]}</small>
              <em>PDB {ref.id}</em>
            </span>
          </button>
        ))}
        <button className="reference-new" onClick={onNew}>
          <PlusOutlined />
          <strong>{zh ? "新建项目" : "New project"}</strong>
          <small>{zh ? "把相关任务放在一起" : "Group related tasks"}</small>
        </button>
      </div>
    </section>
  );
}
