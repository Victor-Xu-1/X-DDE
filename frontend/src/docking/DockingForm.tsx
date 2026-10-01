import { DockingInputs, DockingRegion } from "./DockingQuestions";
import { outputBoundsDefaults } from "../constraints/generated";
import type { OutputSettings } from "../constraints/types";
import { ConstraintPanel } from "../constraints/ConstraintPanel";
import { withConstraints } from "../constraints/model";
import type { ConstraintReference } from "../constraints/types";
import { referenceKey } from "../diffsbdd/model";
import { useEffect, useState } from "react";
import { Questionnaire } from "../guided/Questionnaire";
import { useTaskReadiness } from "../guided/useTaskReadiness";
import type { Job, Language } from "../types";
import type { MoleculeRef } from "../research/types";
import { useTaskSubmit } from "../operations/useTaskSubmit";
import { defaults } from "./generated";
import { task, parseBox } from "./model";
import { DockingOptions } from "./DockingOptions";
import type { DockingMode, SearchBox } from "./types";
export function DockingForm({
  language,
  onCreated,
  mode = "dock",
  initialReceptor = null,
  initialLigand = null,
  initialBox = null,
}: {
  language: Language;
  onCreated(job: Job): void;
  mode?: DockingMode;
  initialReceptor?: MoleculeRef | null;
  initialLigand?: MoleculeRef | null;
  initialBox?: SearchBox | null;
}) {
  const zh = language === "zh",
    run = useTaskSubmit(onCreated);
  const [receptor, setReceptor] = useState(initialReceptor),
    [ligand, setLigand] = useState(initialLigand),
    [reference, setReference] = useState<MoleculeRef | null>(null);
  const [kind, setKind] = useState<"reference" | "box">(
    initialBox ? "box" : "reference",
  );
  const [center, setCenter] = useState(
      initialBox ? initialBox.center.map(String) : ["", "", ""],
    ),
    [size, setSize] = useState(
      initialBox ? initialBox.size.map(String) : ["20", "20", "20"],
    );
  const [options, setOptions] = useState<Record<string, unknown>>(() =>
    structuredClone(defaults),
  );
  const [confirmed, setConfirmed] = useState(false),
    [expert, setExpert] = useState(false),
    [name, setName] = useState("");
  const [error, setError] = useState("");
  const { ready, error: readinessError } = useTaskReadiness(`gnina.${mode}`);
  const [outputSettings, setOutputSettings] = useState<OutputSettings>({
    ...outputBoundsDefaults,
  });
  const [outputChoice, setOutputChoice] = useState<
    "none" | "heavy_atom_centroid" | "all_heavy_atoms"
  >("none");
  const [constraints, setConstraints] = useState<ConstraintReference | null>(
    null,
  );
  useEffect(() => setConstraints(null), [referenceKey(ligand), mode]);
  const labels = {
    dock: ["探索结合模式", "Explore binding poses"],
    score: ["评估已有姿势", "Score existing pose"],
    minimize: ["局部最小化", "Local minimization"],
  };
  function buildTask() {
    return task(
      mode,
      receptor,
      ligand,
      options,
      kind === "reference" ? reference : null,
      mode === "dock" && kind === "box"
        ? parseBox(center, size, language)
        : null,
      confirmed,
      name.trim() || labels[mode][zh ? 0 : 1],
      language,
    );
  }
  let regionValid = false;
  try {
    if (mode !== "dock") regionValid = confirmed;
    else if (kind === "reference")
      regionValid = Boolean(reference && confirmed);
    else {
      parseBox(center, size, language);
      regionValid = true;
    }
  } catch {
    regionValid = false;
  }
  async function submit() {
    setError("");
    try {
      return await run.submit(
        await withConstraints(
          buildTask(),
          constraints,
          language,
          outputChoice,
          outputSettings,
        ),
      );
    } catch (failure) {
      setError(String(failure));
    }
  }
  const inputs = (
    <DockingInputs
      language={language}
      receptor={receptor}
      ligand={ligand}
      onReceptor={(value) => {
        setReceptor(value);
        setReference(null);
        setConfirmed(false);
        setCenter(["", "", ""]);
      }}
      onLigand={(value) => {
        setLigand(value);
        setConfirmed(false);
      }}
    />
  );
  const region = (
    <DockingRegion
      language={language}
      mode={mode}
      receptor={receptor}
      kind={kind}
      reference={reference}
      center={center}
      size={size}
      confirmed={confirmed}
      onKind={(value) => {
        setKind(value);
        setConfirmed(false);
      }}
      onReference={(value) => {
        setReference(value);
        setConfirmed(false);
      }}
      onCenter={setCenter}
      onSize={setSize}
      onConfirmed={setConfirmed}
    />
  );
  const settings = (
    <>
      <label className="field">
        {zh ? "运行方案" : "Run preset"}
        <select
          value={expert ? "expert" : "cpu"}
          onChange={(event) => {
            const advanced = event.target.value === "expert";
            setExpert(advanced);
            if (!advanced) {
              setOptions(structuredClone(defaults));
              setOutputSettings({ ...outputBoundsDefaults });
            }
          }}
        >
          <option value="cpu">
            {zh
              ? "CPU · 经验评分 · 有限搜索"
              : "CPU · empirical scoring · bounded search"}
          </option>
          <option value="expert">{zh ? "专家微调" : "Expert tuning"}</option>
        </select>
      </label>
      {expert && (
        <DockingOptions
          language={language}
          mode={mode}
          value={options}
          onChange={setOptions}
        />
      )}
      {ligand && (
        <ConstraintPanel
          key={referenceKey(ligand)}
          subject={ligand}
          language={language}
          getTask={buildTask}
          value={constraints}
          onChange={setConstraints}
          outputChoice={outputChoice}
          onOutputChoice={setOutputChoice}
          outputSettings={outputSettings}
          onOutputSettings={setOutputSettings}
          expert={expert}
          getOutputBox={() => parseBox(center, size, language)}
          boxFingerprint={JSON.stringify([center, size])}
          onApply={(doc) => {
            const box = doc.conditions.find(
              (c) =>
                c.kind === (mode === "dock" ? "search_box" : "spatial_bounds"),
            );
            if (!box || box.kind === "fixed_region" || !doc.frame)
              throw new Error(
                zh
                  ? "所选条件不包含搜索范围"
                  : "Selected conditions do not contain a search box",
              );
            const post = doc.conditions.find(
              (c) => c.kind === "spatial_bounds",
            );
            setOutputChoice(
              post?.kind === "spatial_bounds" ? post.selection : "none",
            );
            if (post?.kind === "spatial_bounds")
              setOutputSettings({
                strength: post.strength,
                tolerance_angstrom:
                  post.tolerance_angstrom ??
                  outputBoundsDefaults.tolerance_angstrom,
                weight: post.weight ?? 1,
              });
            setReceptor(doc.frame.reference);
            setKind("box");
            setReference(null);
            setConfirmed(false);
            setCenter(box.box.center.map(String));
            setSize(box.box.size.map(String));
          }}
        />
      )}
      <label className="field">
        {zh ? "任务名称（可选）" : "Task name (optional)"}
        <input
          value={name}
          maxLength={80}
          onChange={(event) => setName(event.target.value)}
        />
      </label>
    </>
  );
  const review = (
    <dl className="questionnaire-review">
      <dt>{zh ? "任务" : "Task"}</dt>
      <dd>{labels[mode][zh ? 0 : 1]}</dd>
      <dt>{zh ? "受体和分子" : "Receptor and molecule"}</dt>
      <dd>
        {zh
          ? "沿用已选文件、记录与版本"
          : "Use the selected files, records and versions"}
      </dd>
      <dt>{zh ? "计算范围" : "Calculation region"}</dt>
      <dd>
        {mode !== "dock"
          ? zh
            ? "已有姿势的原坐标系"
            : "Original coordinate frame of the existing pose"
          : kind === "reference"
            ? zh
              ? "参考配体周围"
              : "Around the reference ligand"
            : zh
              ? "所选口袋或指定区域"
              : "Selected pocket or specified region"}
      </dd>
      <dt>{zh ? "参数模式" : "Parameter mode"}</dt>
      <dd>
        {expert
          ? zh
            ? "专家微调"
            : "Expert tuning"
          : zh
            ? "推荐的有限 CPU 方案"
            : "Recommended bounded CPU settings"}
      </dd>
      <dt>{zh ? "任务名称" : "Task name"}</dt>
      <dd>{name.trim() || labels[mode][zh ? 0 : 1]}</dd>
    </dl>
  );
  return (
    <Questionnaire
      language={language}
      busy={run.busy}
      error={error || run.error || readinessError}
      ready={ready}
      unavailable={
        zh
          ? "请在安装与组件中配置 GNINA。当前选择已保留，可稍后启动。"
          : "Configure GNINA in Installation & components. Your choices are retained for a later start."
      }
      submitLabel={labels[mode][zh ? 0 : 1]}
      onSubmit={submit}
      steps={[
        {
          title: zh ? "选择材料" : "Choose inputs",
          content: inputs,
          valid: Boolean(receptor && ligand),
        },
        {
          title: zh ? "选择区域" : "Choose region",
          content: region,
          valid: regionValid,
        },
        {
          title: zh ? "选择方案" : "Choose settings",
          content: settings,
          valid: true,
        },
        {
          title: zh ? "确认启动" : "Review & start",
          content: review,
          valid: Boolean(receptor && ligand) && regionValid,
        },
      ]}
    />
  );
}
