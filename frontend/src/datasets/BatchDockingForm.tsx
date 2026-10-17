import { useEffect, useState } from "react";
import { BatchSettings, defaultBatchSettings } from "./BatchSettings";
import { GuidedSteps } from "../guided/Questionnaire";
import { useTaskReadiness } from "../guided/useTaskReadiness";
import { ChoiceCards } from "../guided/ChoiceCards";
import { BatchCandidates } from "./BatchCandidates";
import type { Job, Language } from "../types";
import { SourcePicker } from "./SourcePicker";
import {
  PocketQuestion,
  ReceptorQuestion,
  usePocketQuestions,
} from "./PocketQuestions";
import { taskFor } from "./dataset-model";
import { useDatasetRun, type DatasetExecution } from "./useDatasetRun";
import { ExecutionView } from "./ExecutionView";
import { useDatasetExample } from "./useDatasetExample";
import { useBatchCandidates } from "./useBatchCandidates";

export function BatchDockingForm({
  language,
  onCreated,
}: {
  language: Language;
  onCreated(job: Job): void;
}) {
  const zh = language === "zh",
    pocket = usePocketQuestions(language),
    run = useDatasetRun(onCreated),
    readiness = useTaskReadiness("screening.dock"),
    [device, setDevice] = useState<"cpu" | "cuda">("cpu"),
    [name, setName] = useState(""),
    [error, setError] = useState("");
  const [settings, setSettings] = useState({ ...defaultBatchSettings });
  const {
    source,
    candidates,
    selected,
    choose,
    toggle,
    setSelected,
    ready: selectionReady,
    loading,
  } = useBatchCandidates(setError);
  const example = useDatasetExample(setError, language);
  useEffect(() => {
    if (!example) return;
    void choose(
      example.sources,
      (example.task.payload.selected_ids as string[]) ?? [],
    );
    setName(example.task.name);
    setDevice(example.task.options?.device === "cuda" ? "cuda" : "cpu");
    setSettings(
      (old) =>
        Object.fromEntries(
          Object.entries(old).map(([key, value]) => [
            key,
            (example.task.payload.docking as Record<string, unknown>)?.[key] ??
              value,
          ]),
        ) as typeof old,
    );
  }, [example]);
  async function submit() {
    if (!pocket.receptor || !pocket.pocket || !selectionReady) return;
    return run.submit(
      taskFor(
        "screening.dock",
        {
          kind: "gnina",
          mode: "batch",
          alternate_locations: "highest_occupancy",
          receptor: pocket.receptor,
          search: pocket.pocket,
          selected_ids: selected,
          docking: {
            use_gpu: device === "cuda",
            cpu: 2,
            memory_mib: 8192,
            ...settings,
            cnn_scoring: device === "cuda" ? "rescore" : "none",
          },
        },
        pocket.inputs,
        source,
        name.trim() || (zh ? "候选分子批量对接" : "Candidate batch docking"),
        { device, cpu: 2, memory_mib: 8192, seed: 101 },
      ),
    );
  }
  return (
    <div className="dataset-workspace">
      <GuidedSteps<DatasetExecution>
        language={language}
        busy={run.busy}
        error={run.error || error}
        ready={readiness.ready}
        onCheckEnvironment={readiness.recheck}
        unavailable={
          zh ? "请在安装与组件中准备 GNINA。" : "Prepare GNINA in Components."
        }
        onSubmit={submit}
        submitLabel={zh ? "提交批量对接" : "Submit batch docking"}
        renderResult={(value) => (
          <ExecutionView
            execution={value}
            language={language}
            onCreated={onCreated}
          />
        )}
        steps={[
          {
            title: zh ? "选择靶点" : "Choose target",
            valid: !!pocket.receptor,
            content: (
              <div className="dataset-question-content">
                <ReceptorQuestion value={pocket} language={language} />
              </div>
            ),
          },
          {
            title: zh ? "选择口袋" : "Choose pocket",
            valid: !!pocket.pocket,
            content: (
              <div className="dataset-question-content">
                <PocketQuestion value={pocket} language={language} />
              </div>
            ),
          },
          {
            title: zh ? "选择候选分子" : "Choose candidates",
            valid: selectionReady,
            content: (
              <div className="dataset-question-content">
                <SourcePicker
                  role="screening"
                  values={source}
                  onChange={(values) => void choose(values)}
                  language={language}
                  label={
                    zh
                      ? "已完成的筛选或 DEL 候选集"
                      : "Completed screening or DEL candidate set"
                  }
                />
                {loading && (
                  <p className="field-help" role="status">
                    {zh ? "正在读取候选分子…" : "Loading candidate molecules…"}
                  </p>
                )}
                {candidates.length > 0 && (
                  <BatchCandidates
                    candidates={candidates}
                    selected={selected}
                    onToggle={toggle}
                    onSelection={setSelected}
                    language={language}
                  />
                )}
              </div>
            ),
          },
          {
            title: zh ? "确认对接方案" : "Review docking plan",
            valid: !!pocket.pocket && selectionReady,
            content: (
              <div className="dataset-question-content">
                <ChoiceCards<"cpu" | "cuda">
                  label={zh ? "计算设备" : "Compute device"}
                  value={device}
                  onChange={setDevice}
                  options={[
                    {
                      value: "cpu",
                      title: "CPU",
                      note: zh ? "经验能量评分" : "Empirical scoring",
                    },
                    {
                      value: "cuda",
                      title: "GPU",
                      note: zh
                        ? "经验能量＋CNN 复核"
                        : "Empirical energy and CNN rescoring",
                    },
                  ]}
                />
                <div className="dataset-review-strip">
                  <div>
                    <span>{zh ? "对接分子" : "Molecules to dock"}</span>
                    <strong>{selected.length}</strong>
                  </div>
                  <div>
                    <span>{zh ? "每个分子的姿势" : "Poses per molecule"}</span>
                    <strong>{settings.num_modes}</strong>
                  </div>
                </div>
                <BatchSettings
                  language={language}
                  value={settings}
                  onChange={setSettings}
                />
                <label className="field">
                  {zh ? "任务名称" : "Task name"}
                  <input
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    maxLength={70}
                  />
                </label>
              </div>
            ),
          },
        ]}
      />
    </div>
  );
}
