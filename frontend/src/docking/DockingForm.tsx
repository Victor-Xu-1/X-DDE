import { outputBoundsDefaults } from "../constraints/generated";
import type { OutputSettings } from "../constraints/types";
import { ConstraintPanel } from "../constraints/ConstraintPanel";
import { withConstraints } from "../constraints/model";
import type { ConstraintReference } from "../constraints/types";
import { referenceKey } from "../diffsbdd/model";
import { useEffect, useState } from "react";
import { request } from "../api";
import type { Job, Language } from "../types";
import type { MoleculeRef } from "../research/types";
import { ReferencePicker } from "../diffsbdd/ReferencePicker";
import { useTaskSubmit } from "../operations/useTaskSubmit";
import { defaults } from "./generated";
import { task, parseBox } from "./model";
import { SearchRegion } from "./SearchRegion";
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
  const [ready, setReady] = useState(false),
    [error, setError] = useState("");
  useEffect(() => {
    const controller = new AbortController();
    void request<{ availability: { configuration_present: boolean } }>(
      `/capabilities/gnina.${mode}`,
      { signal: controller.signal },
    )
      .then((value) => {
        if (!controller.signal.aborted)
          setReady(value.availability.configuration_present);
      })
      .catch((failure) => {
        if (!controller.signal.aborted) setError(String(failure));
      });
    return () => controller.abort();
  }, [mode]);
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
  return (
    <form
      className="tool-form"
      onSubmit={(event) => {
        event.preventDefault();
        setError("");
        try {
          void withConstraints(
            buildTask(),
            constraints,
            language,
            outputChoice,
            outputSettings,
          )
            .then(run.submit)
            .catch((failure) => setError(String(failure)));
        } catch (failure) {
          setError(String(failure));
        }
      }}
    >
      <fieldset disabled={run.busy}>
        <ReferencePicker
          kind="structure"
          label={zh ? "受体结构" : "Receptor structure"}
          value={receptor}
          language={language}
          onChange={(value) => {
            setReceptor(value);
            setReference(null);
            setConfirmed(false);
            setCenter(["", "", ""]);
          }}
        />
        <ReferencePicker
          kind="ligand"
          label={
            zh ? "选择分子或已有姿势" : "Choose a molecule or existing pose"
          }
          value={ligand}
          language={language}
          onChange={(value) => {
            setLigand(value);
            setConfirmed(false);
          }}
        />
        {mode === "dock" && (
          <SearchRegion
            receptor={receptor}
            language={language}
            kind={kind}
            onKind={(value) => {
              setKind(value);
              setConfirmed(false);
            }}
            reference={reference}
            onReference={(value) => {
              setReference(value);
              setConfirmed(false);
            }}
            center={center}
            onCenter={setCenter}
            size={size}
            onSize={setSize}
          />
        )}
        {(mode !== "dock" || kind === "reference") && (
          <label>
            <input
              type="checkbox"
              checked={confirmed}
              onChange={(event) => setConfirmed(event.target.checked)}
            />
            {zh
              ? "我确认参考配体/已有姿势位于所选受体的坐标系中"
              : "I confirm the reference/existing pose is in the selected receptor coordinate frame"}
          </label>
        )}
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
        {mode === "dock" && ligand && (
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
            onApply={(doc) => {
              const box = doc.conditions.find((c) => c.kind === "search_box");
              if (!box || box.kind !== "search_box" || !doc.frame)
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
        {!ready && (
          <p className="field-help">
            {zh
              ? "请先在集成环境管理中配置 GNINA；现在可以准备输入。"
              : "Configure GNINA in component management first; inputs can be prepared now."}
          </p>
        )}
        {(error || run.error) && (
          <p role="alert" className="error-box">
            {error || run.error}
          </p>
        )}
        <button
          className="primary-button"
          disabled={!ready || run.busy || !receptor || !ligand}
        >
          {labels[mode][zh ? 0 : 1]}
        </button>
      </fieldset>
    </form>
  );
}
