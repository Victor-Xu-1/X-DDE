import { useEffect, useId, useRef, useState } from "react";
import type { Health, Job, Language, Prediction } from "../types";
import { tools, type ToolId } from "./catalog";
import { CapabilityFilters } from "./CapabilityFilters";
import { ModalityTags } from "./ModalityTags";
import {
  filterCapabilities,
  type ModalityFilter,
  type PurposeFilter,
} from "./filter";
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
    [modality, setModality] = useState<ModalityFilter>("all"),
    [group, setGroup] = useState<PurposeFilter>("all"),
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
  const filteredTools = filterCapabilities(modality, group, query);
  function clearFilters() {
    setQuery("");
    setGroup("all");
    setModality("all");
    search.current?.focus();
  }
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
                ? "先选药物形式，再选研究用途。同一能力可属于多个类别。"
                : "Choose a drug modality, then a research purpose. Capabilities can belong to multiple categories."}
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
          <CapabilityFilters
            language={language}
            searchRef={search}
            query={query}
            onQuery={setQuery}
            modality={modality}
            onModality={setModality}
            purpose={group}
            onPurpose={setGroup}
          />
          <div className="tool-results-summary">
            <p role="status" aria-live="polite" aria-atomic="true">
              {zh
                ? `显示 ${filteredTools.length} / ${tools.length} 项能力`
                : `Showing ${filteredTools.length} of ${tools.length} capabilities`}
            </p>
            {(query || group !== "all" || modality !== "all") && (
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
                  <ModalityTags tool={t} language={language} />
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
