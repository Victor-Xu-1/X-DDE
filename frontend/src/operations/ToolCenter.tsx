import { useState } from "react";
import type { Health, Job, Language, Prediction } from "../types";
import { tools, type ToolId } from "./catalog";
import { PropertyForm } from "./PropertyForm";
import { FeatureForm } from "./FeatureForm";
import { ImportForm } from "./ImportForm";
import { ResourceForm } from "./ResourceForm";
import { HarnessForm } from "./HarnessForm";
import { CampaignForm } from "./CampaignForm";
import "./operations.css";

export function ToolCenter({
  language,
  health,
  jobs,
  onCreated,
  onPredict,
  onDraft,
}: {
  language: Language;
  health: Health | null;
  jobs: Job[];
  onCreated(j: Job): void;
  onPredict(): void;
  onDraft(p: Prediction): void;
}) {
  const zh = language === "zh",
    [selected, setSelected] = useState<ToolId | null>(null),
    [group, setGroup] = useState("all"),
    [query, setQuery] = useState("");
  const current = tools.find((t) => t.id === selected),
    index = zh ? 0 : 1;
  const groups = [
    ["all", "全部能力", "All capabilities"],
    ["design", "设计", "Design"],
    ["structure", "结构预测", "Structures"],
    ["evaluate", "性质与评分", "Properties & scoring"],
    ["analyze", "结果分析", "Analysis"],
    ["search", "检索", "Search"],
    ["prepare", "输入准备", "Preparation"],
    ["system", "资源配置", "Resources"],
  ];
  return (
    <section className="tool-center">
      <header className="studio-intro">
        <div>
          <h1>{zh ? "X-DDE 药物研究工作台" : "X-DDE Discovery Workbench"}</h1>
          <p>
            {zh
              ? "先选研究目标，再按提示准备输入。每个工具都标明能力来源，专家模式可查看原生参数。"
              : "Choose your research goal and follow the input guide. Each tool identifies its source; expert mode exposes native scientific parameters."}
          </p>
        </div>
      </header>
      {current ? (
        <>
          <button className="text-button" onClick={() => setSelected(null)}>
            ← {zh ? "返回全部能力" : "All capabilities"}
          </button>
          <header className="tool-heading">
            <span className="source-badge">{current.source}</span>
            <h2>{current.label[index]}</h2>
            <p>{current.note[index]}</p>
          </header>
          {selected === "properties" ? (
            <PropertyForm language={language} onCreated={onCreated} />
          ) : selected === "features" ? (
            <FeatureForm language={language} onCreated={onCreated} />
          ) : selected === "import" ? (
            <ImportForm
              language={language}
              jobs={jobs}
              onCreated={onCreated}
              onDraft={onDraft}
            />
          ) : selected === "resources" ? (
            <ResourceForm
              language={language}
              health={health}
              onCreated={onCreated}
            />
          ) : selected === "campaign" ? (
            <CampaignForm language={language} />
          ) : (
            <HarnessForm
              key={selected}
              tool={selected!}
              language={language}
              onCreated={onCreated}
            />
          )}
        </>
      ) : (
        <>
          <div className="tool-filter">
            <label className="field">
              <span className="sr-only">
                {zh ? "搜索能力" : "Search capabilities"}
              </span>
              <input
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={
                  zh
                    ? "我想做：性质、抗体设计、MSA、结构比较…"
                    : "Find properties, antibody design, MSA, structure comparison…"
                }
              />
            </label>
            <div
              className="tool-groups"
              role="group"
              aria-label={zh ? "能力分类" : "Capability groups"}
            >
              {groups.map(([id, cn, en]) => (
                <button
                  key={id}
                  aria-pressed={group === id}
                  className={group === id ? "selected" : ""}
                  onClick={() => setGroup(id)}
                >
                  {zh ? cn : en}
                </button>
              ))}
            </div>
          </div>
          <div className="tool-grid">
            {tools
              .filter(
                (t) =>
                  (group === "all" || t.group === group) &&
                  `${t.label.join(" ")} ${t.note.join(" ")} ${t.source}`
                    .toLowerCase()
                    .includes(query.toLowerCase()),
              )
              .map((t) => (
                <button
                  className="tool-card"
                  key={t.id}
                  onClick={() =>
                    t.id === "predict" ? onPredict() : setSelected(t.id)
                  }
                  title={t.note[index]}
                >
                  <span className="source-badge">{t.source}</span>
                  <h3>{t.label[index]}</h3>
                  <p>{t.note[index]}</p>
                  <span className="tool-open">
                    {zh ? "开始准备" : "Prepare task"} →
                  </span>
                </button>
              ))}
          </div>
          <p className="capability-note">
            {zh
              ? "当前后端范围：已核对的 OpenDDE / Harness 不提供通用小分子从头生成、完整 ADMET 或经过校准的亲和力预测；Harness 的客观可开发性后端未公开。X-DDE 可接入其他软件扩展能力，完成适配后再开放；LLM 判断保留实际来源。"
              : "Current backend scope: audited OpenDDE / Harness does not provide generic small-molecule generation, complete ADMET or calibrated affinity; Harness objective developability is not published. X-DDE can expand through additional software after real integration. LLM judgments retain their provenance."}
          </p>
        </>
      )}
    </section>
  );
}
