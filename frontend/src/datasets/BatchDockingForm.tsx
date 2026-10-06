import { useEffect, useState } from "react";
import { request } from "../api";
import { GuidedSteps } from "../guided/Questionnaire";
import { useTaskReadiness } from "../guided/useTaskReadiness";
import { ChoiceCards } from "../guided/ChoiceCards";
import { MoleculeImage } from "../presentation/MoleculeImage";
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
import type {
  AvailableDataset,
  DatasetResult,
  DatasetCandidate,
} from "./types";
import { useDatasetExample } from "./useDatasetExample";

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
    [source, setSource] = useState<AvailableDataset[]>([]),
    [candidates, setCandidates] = useState<DatasetCandidate[]>([]),
    [selected, setSelected] = useState<string[]>([]),
    [device, setDevice] = useState<"cpu" | "cuda">("cpu"),
    [name, setName] = useState(""),
    [error, setError] = useState("");
  async function choose(values: AvailableDataset[]) {
    setSource(values);
    setCandidates([]);
    setSelected([]);
    setError("");
    if (!values[0]) return;
    try {
      const result = await request<DatasetResult>(
        `/jobs/${values[0].job_id}/result`,
      );
      const rows = result.candidates.filter((row) => row.artifact);
      setCandidates(rows);
      setSelected(rows.slice(0, 25).map((row) => row.id));
    } catch (e) {
      setError(String(e));
    }
  }
  const example = useDatasetExample(setError);
  useEffect(() => {
    if (!example) return;
    void choose(example.sources).then(() =>
      setSelected((example.task.payload.selected_ids as string[]) ?? []),
    );
    setName(example.task.name);
  }, [example]);
  function toggle(id: string) {
    setSelected((values) =>
      values.includes(id)
        ? values.filter((value) => value !== id)
        : [...values, id],
    );
  }
  async function submit() {
    if (!pocket.receptor || !pocket.pocket) return;
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
            exhaustiveness: 8,
            num_modes: 3,
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
            valid: source.length === 1 && selected.length > 0,
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
                {candidates.length > 0 && (
                  <>
                    <div className="dataset-field-heading">
                      <strong>
                        {zh ? "选择要对接的分子" : "Select molecules to dock"}
                      </strong>
                      <button
                        type="button"
                        onClick={() =>
                          setSelected(candidates.map((row) => row.id))
                        }
                      >
                        {zh ? "选择全部" : "Select all"}
                      </button>
                    </div>
                    <div className="dataset-candidate-select-grid">
                      {candidates.map((row) => (
                        <label
                          key={row.id}
                          className={
                            selected.includes(row.id) ? "selected" : ""
                          }
                        >
                          <input
                            type="checkbox"
                            checked={selected.includes(row.id)}
                            onChange={() => toggle(row.id)}
                          />
                          <MoleculeImage
                            source={row.smiles ? { smiles: row.smiles } : null}
                            language={language}
                            label={row.id}
                            compact
                          />
                          <strong>{row.id}</strong>
                        </label>
                      ))}
                    </div>
                  </>
                )}
              </div>
            ),
          },
          {
            title: zh ? "确认对接方案" : "Review docking plan",
            valid: !!pocket.pocket && selected.length > 0,
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
                    <strong>3</strong>
                  </div>
                </div>
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
