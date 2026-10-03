import { useEffect, useId, useRef, useState } from "react";
import type { Health, Job, Language, Prediction } from "../types";
import { tools, type ToolId } from "./catalog";
import { CapabilityFilters } from "./CapabilityFilters";
import { ModalityTags } from "./ModalityTags";
import { filterCapabilities, type ModalityFilter } from "./filter";
import { QualityForm } from "../quality/QualityForm";
import { AdmetForm } from "../admet/AdmetForm";
import { HumanizationForm } from "../humanization/HumanizationForm";
import { AntibodyNumberForm } from "../antibodies/AntibodyNumberForm";
import { LibraryScreenForm } from "../chemistry/LibraryScreenForm";
import { StructurePrepareForm } from "../receptors/StructurePrepareForm";
import { ReferenceImportForm } from "../discovery/ReferenceImportForm";
import { TargetResearchForm } from "../discovery/TargetResearchForm";
import { PropertyForm } from "./PropertyForm";
import { FeatureForm } from "./FeatureForm";
import { ImportForm } from "./ImportForm";
import { HarnessForm } from "./HarnessForm";
import { CampaignForm } from "./CampaignForm";
import "./operations.css";
import { RegionWorkspace } from "../regions/RegionWorkspace";
import { PocketForm } from "../pockets/PocketForm";
import { PoseWorkspace } from "../poses/PoseWorkspace";
import { WorkflowCenter } from "../workflows/WorkflowCenter";
import { ReceptorForm } from "../receptors/ReceptorForm";
import { StateForm } from "../chemistry/StateForm";
import { DiffForm } from "../diffsbdd/DiffForm";
import { DockingForm } from "../docking/DockingForm";
import { ExampleActions } from "../examples/ExampleActions";
import { ExampleContext } from "../examples/context";
import type { PreparedExample } from "../examples/types";
import type { DockingMode } from "../docking/types";
import type { DiffMode } from "../diffsbdd/types";

export function ToolCenter({
  language,
  jobs,
  onCreated,
  onPredict,
  onDraft,
  initialTool = null,
  onBrowse,
}: {
  initialTool?: ToolId | null;
  onBrowse?(): void;
  language: Language;
  health: Health | null;
  jobs: Job[];
  onCreated(j: Job): void;
  onPredict(): void;
  onDraft(p: Prediction): void;
}) {
  const zh = language === "zh",
    [selected, setSelected] = useState<ToolId | null>(initialTool),
    [modality, setModality] = useState<ModalityFilter>("all");
  const current = filterCapabilities("all").find((t) => t.id === selected),
    index = zh ? 0 : 1;
  const headingId = useId(),
    heading = useRef<HTMLHeadingElement>(null),
    lastOpenedTool = useRef<ToolId | null>(null),
    cards = useRef<Partial<Record<ToolId, HTMLButtonElement | null>>>({});
  useEffect(() => {
    if (selected) heading.current?.focus();
    else if (lastOpenedTool.current)
      cards.current[lastOpenedTool.current]?.focus();
  }, [selected]);
  const filteredTools = filterCapabilities(modality);
  const [example, setExample] = useState<PreparedExample | null>(null);
  const [exampleLoad, setExampleLoad] = useState(0);
  const [previewing, setPreviewing] = useState(false);
  return (
    <section
      className={`tool-center ${current ? "task-workspace " + (previewing ? "is-result" : "is-input") : ""}`}
      aria-labelledby={headingId}
    >
      {current && (
        <div className="tool-context">
          <button
            type="button"
            className="tool-back-button"
            onClick={() => {
              if (onBrowse) onBrowse();
              else setSelected(null);
            }}
          >
            <span aria-hidden="true">← </span>
            {zh ? "返回全部能力" : "Back to all capabilities"}
          </button>
        </div>
      )}
      <h1
        id={headingId}
        ref={heading}
        tabIndex={-1}
        className={current && !initialTool ? "compact-tool-heading" : "sr-only"}
      >
        {current ? current.label[index] : zh ? "全部能力" : "All capabilities"}
      </h1>
      {current ? (
        <>
          <ExampleActions
            capability={current.id}
            language={language}
            onLoad={(value) => {
              setExample(value);
              setExampleLoad((n) => n + 1);
            }}
            onPreviewChange={setPreviewing}
            onClear={() => {
              setExample(null);
              setExampleLoad((n) => n + 1);
            }}
          />
          <div hidden={previewing}>
            <ExampleContext.Provider
              key={current.id + ":" + exampleLoad}
              value={
                example?.module.capability_id === current.id ? example : null
              }
            >
              {selected === "antibody.humanize" ? (
                <HumanizationForm language={language} onCreated={onCreated} />
              ) : selected === "admet.predict" ? (
                <AdmetForm language={language} onCreated={onCreated} />
              ) : selected === "posebusters.check" ? (
                <QualityForm language={language} onCreated={onCreated} />
              ) : selected === "antibody.number" ? (
                <AntibodyNumberForm language={language} onCreated={onCreated} />
              ) : selected === "chemistry.screen" ? (
                <LibraryScreenForm language={language} onCreated={onCreated} />
              ) : selected === "biopython.prepare" ? (
                <StructurePrepareForm
                  language={language}
                  onCreated={onCreated}
                />
              ) : selected === "discovery.import" ? (
                <ReferenceImportForm
                  language={language}
                  onCreated={onCreated}
                />
              ) : selected?.startsWith("discovery.") ? (
                <TargetResearchForm
                  key={selected}
                  entity={
                    selected === "discovery.target" ? "target" : "disease"
                  }
                  language={language}
                  onCreated={onCreated}
                />
              ) : selected === "pose_exploration" ? (
                <PoseWorkspace language={language} />
              ) : selected === "biopython.ensemble" ? (
                <ReceptorForm language={language} onCreated={onCreated} />
              ) : selected === "chemistry.states" ? (
                <StateForm language={language} onCreated={onCreated} />
              ) : selected === "regions" ? (
                <RegionWorkspace language={language} />
              ) : selected === "p2rank.detect" ? (
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
              ) : selected?.startsWith("gnina.") ? (
                <DockingForm
                  key={selected}
                  mode={selected.slice(6) as DockingMode}
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
            </ExampleContext.Provider>
          </div>
        </>
      ) : (
        <>
          <CapabilityFilters
            language={language}
            modality={modality}
            onModality={setModality}
          />
          <p
            className="sr-only"
            role="status"
            aria-live="polite"
            aria-atomic="true"
          >
            {zh
              ? `显示 ${filteredTools.length} / ${filterCapabilities("all").length} 项能力`
              : `Showing ${filteredTools.length} of ${filterCapabilities("all").length} capabilities`}
          </p>
          {
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
                  title={t.note[index] + " · " + t.source}
                >
                  <h2>{t.label[index]}</h2>
                  <p>{t.note[index]}</p>
                  <ModalityTags tool={t} language={language} />
                  <span className="tool-open">
                    {zh ? "开始准备" : "Prepare task"} →
                  </span>
                </button>
              ))}
            </div>
          }
        </>
      )}
    </section>
  );
}
