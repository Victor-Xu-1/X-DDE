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
  const labels = {
    dock: ["探索结合模式", "Explore binding poses"],
    score: ["评估已有姿势", "Score existing pose"],
    minimize: ["局部最小化", "Local minimization"],
  };
  return (
    <form
      className="tool-form"
      onSubmit={(event) => {
        event.preventDefault();
        setError("");
        try {
          void run.submit(
            task(
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
            ),
          );
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
              if (!advanced) setOptions(structuredClone(defaults));
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
