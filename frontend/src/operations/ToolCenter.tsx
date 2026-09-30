import { useEffect, useId, useRef, useState } from "react";
import type { Health, Job, Language, Prediction } from "../types";
import { tools, type ToolId } from "./catalog";
import { PropertyForm } from "./PropertyForm";
import { FeatureForm } from "./FeatureForm";
import { ImportForm } from "./ImportForm";
import { ResourceForm } from "./ResourceForm";
import { HarnessForm } from "./HarnessForm";
import { CampaignForm } from "./CampaignForm";
import "./operations.css";
import { PocketForm } from "../pockets/PocketForm";
import { WorkflowCenter } from "../workflows/WorkflowCenter";
import { DiffForm } from "../diffsbdd/DiffForm";
import type { DiffMode } from "../diffsbdd/types";

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
  const headingId = useId(),
    heading = useRef<HTMLHeadingElement>(null),
    search = useRef<HTMLInputElement>(null),
    lastOpenedTool = useRef<ToolId | null>(null),
    cards = useRef<Partial<Record<ToolId, HTMLButtonElement | null>>>({});
  useEffect(() => {
    if (selected) heading.current?.focus();
    else if (lastOpenedTool.current)
      cards.current[lastOpenedTool.current]?.focus();
  }, [selected]);
  const filteredTools = tools.filter(
    (t) =>
      (group === "all" || t.group === group) &&
      `${t.label.join(" ")} ${t.note.join(" ")} ${t.source}`
        .toLowerCase()
        .includes(query.trim().toLowerCase()),
  );
  function clearFilters() {
    setQuery("");
    setGroup("all");
    search.current?.focus();
  }
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
    <section className="tool-center" aria-labelledby={headingId}>
      {current && (
        <div className="tool-context">
          <button
            type="button"
            className="tool-back-button"
            onClick={() => setSelected(null)}
          >
            <span aria-hidden="true">← </span>
            {zh ? "返回全部能力" : "Back to all capabilities"}
          </button>
          <span className="source-badge">{current.source}</span>
        </div>
      )}
      <header
        className={current ? "studio-intro tool-heading" : "studio-intro"}
      >
        <div>
          <h1 id={headingId} ref={heading} tabIndex={-1}>
            {current
              ? current.label[index]
              : zh
                ? "全部能力"
                : "All capabilities"}
          </h1>
          <p>
            {current
              ? current.note[index]
              : zh
                ? "按研究目标选择工具，准备输入后创建任务。"
                : "Choose a tool for your research goal, then prepare its inputs."}
          </p>
        </div>
      </header>
      {current ? (
        <>
          {selected === "p2rank.detect" ? (
            <PocketForm
              language={language}
              onCreated={onCreated}
              onPredict={onPredict}
            />
          ) : selected === "workflows" ? (
            <WorkflowCenter language={language} jobs={jobs} />
          ) : selected?.startsWith("diffsbdd.") ? (
            <DiffForm
              key={selected}
              mode={selected.slice(9) as DiffMode}
              language={language}
              onCreated={onCreated}
            />
          ) : selected === "properties" ? (
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
                ref={search}
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
                  type="button"
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
          <div className="tool-results-summary">
            <p role="status" aria-live="polite" aria-atomic="true">
              {zh
                ? `显示 ${filteredTools.length} / ${tools.length} 项能力`
                : `Showing ${filteredTools.length} of ${tools.length} capabilities`}
            </p>
            {(query || group !== "all") && (
              <button
                type="button"
                className="tool-clear-filters"
                onClick={clearFilters}
              >
                {zh ? "清空搜索与筛选" : "Clear search and filters"}
              </button>
            )}
          </div>
          {filteredTools.length ? (
            <div className="tool-grid">
              {filteredTools.map((t) => (
                <button
                  type="button"
                  className="tool-card"
                  key={t.id}
                  ref={(element) => {
                    cards.current[t.id] = element;
                  }}
                  onClick={() => {
                    if (t.id === "predict") onPredict();
                    else {
                      lastOpenedTool.current = t.id;
                      setSelected(t.id);
                    }
                  }}
                  aria-label={t.label[index]}
                  title={t.note[index]}
                >
                  <span className="source-badge">{t.source}</span>
                  <h2>{t.label[index]}</h2>
                  <p>{t.note[index]}</p>
                  <span className="tool-open">
                    {zh ? "开始准备" : "Prepare task"} →
                  </span>
                </button>
              ))}
            </div>
          ) : (
            <div className="tool-empty-state">
              <h2>{zh ? "未找到匹配的能力" : "No matching capabilities"}</h2>
              <p>
                {zh
                  ? "试试其他关键词，或清空筛选查看全部能力。"
                  : "Try a different keyword or clear the filters to see every capability."}
              </p>
              <button type="button" onClick={clearFilters}>
                {zh ? "查看全部能力" : "Show all capabilities"}
              </button>
            </div>
          )}
          <p className="capability-note">
            {zh
              ? "当前 OpenDDE / Harness 适配范围：已核对的 OpenDDE / Harness 不提供通用小分子从头生成、完整 ADMET 或经过校准的亲和力预测；Harness 的客观可开发性后端未公开。X-DDE 可接入其他软件扩展能力，完成适配后再开放；LLM 判断保留实际来源。"
              : "Current OpenDDE / Harness adapter scope: audited OpenDDE / Harness does not provide generic small-molecule generation, complete ADMET or calibrated affinity; Harness objective developability is not published. X-DDE can expand through additional software after real integration. LLM judgments retain their provenance."}
          </p>
        </>
      )}
    </section>
  );
}
